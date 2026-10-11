"""Read the schema (models) out of a SQL Server .bak file without restoring it.

The backup was taken on SQL Server 2022, which older local instances cannot
restore, so this script reads the 8 KB data pages straight from the backup
file and decodes the system catalog tables that describe the user schema.

Only the Python standard library is used. Works for uncompressed, unencrypted
full backups.

Usage:
    python Debug/read_bak_models.py
    python Debug/read_bak_models.py --bak path/to/file.bak --out Md/MODELS.md
"""

import argparse
import datetime
import struct
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BAK = ROOT / "BackUp" / "C2SE10_KinderLog_new.bak"
DEFAULT_OUT = ROOT / "Md" / "MODELS.md"

PAGE = 8192
DATA_PAGE = 1

# Object ids of the system base tables that hold the schema.
SYSSCHOBJS = 34        # objects: tables, constraints, views, procedures, triggers
SYSCOLPARS = 41        # columns
SYSIDXSTATS = 54       # indexes
SYSISCOLS = 55         # index key columns
SYSOBJVALUES = 60      # default / check / module definitions
SYSSINGLEOBJREFS = 74  # foreign key references

# sysschobjs.type
TABLE, PRIMARY_KEY, UNIQUE, FOREIGN_KEY, DEFAULT, CHECK = "U", "PK", "UQ", "F", "D", "C"
VIEW, PROCEDURE, TRIGGER = "V", "P", "TR"

# syscolpars.status
COL_NOT_NULL, COL_IDENTITY, COL_COMPUTED = 0x1, 0x4, 0x10
# sysidxstats.status
IDX_UNIQUE, IDX_PRIMARY_KEY, IDX_UNIQUE_CONSTRAINT = 0x8, 0x20, 0x40
# sysiscols.status
KEY_DESCENDING = 0x4
# syssingleobjrefs.class
FK_REFERENCED_TABLE, FK_PARENT_COLUMN, FK_REFERENCED_COLUMN = 27, 28, 29

TYPE_NAMES = {
    34: "image", 35: "text", 36: "uniqueidentifier", 40: "date", 41: "time",
    42: "datetime2", 43: "datetimeoffset", 48: "tinyint", 52: "smallint",
    56: "int", 58: "smalldatetime", 59: "real", 60: "money", 61: "datetime",
    62: "float", 98: "sql_variant", 99: "ntext", 104: "bit", 106: "decimal",
    108: "numeric", 122: "smallmoney", 127: "bigint", 165: "varbinary",
    167: "varchar", 173: "binary", 175: "char", 189: "timestamp",
    231: "nvarchar", 239: "nchar", 241: "xml",
}
SYSNAME_UTYPE = 256

# Objects SSMS adds for its database diagram feature; not part of the app model.
DIAGRAM_OBJECTS = {
    "sysdiagrams", "fn_diagramobjects", "sp_alterdiagram", "sp_creatediagram",
    "sp_dropdiagram", "sp_helpdiagramdefinition", "sp_helpdiagrams",
    "sp_renamediagram", "sp_upgraddiagrams",
}


# ---------- backup file -> pages -> records ----------

def is_page_header(data, off):
    if data[off] != 1 or data[off + 1] not in (1, 2, 3, 4):
        return False
    slots, _obj, _free, free_data, _page_id, file_id = struct.unpack_from("<HIHHIH", data, off + 22)
    return file_id == 1 and 96 <= free_data <= PAGE and slots <= 1000


def load_pages(data):
    """Return {page_id: file offset} for every page of the primary data file."""
    # Pages sit back to back after the backup header; find how they are aligned.
    votes = Counter(off % PAGE for off in range(0, len(data) - PAGE + 1, 512) if is_page_header(data, off))
    if not votes:
        raise SystemExit("No SQL Server data pages found. Is the backup compressed or encrypted?")
    start = votes.most_common(1)[0][0]
    pages = {}
    for off in range(start, len(data) - PAGE + 1, PAGE):
        if is_page_header(data, off):
            pages[struct.unpack_from("<I", data, off + 32)[0]] = off
    return pages


def records(data, pages, object_id):
    """Yield (fixed bytes, [variable-length column bytes]) for each row of a system table."""
    for page_id in sorted(pages):
        off = pages[page_id]
        index_id, = struct.unpack_from("<H", data, off + 6)
        slots, obj = struct.unpack_from("<HI", data, off + 22)
        if data[off + 1] != DATA_PAGE or obj != object_id or index_id != 1:
            continue
        page = data[off:off + PAGE]
        for slot in range(slots):
            rec, = struct.unpack_from("<H", page, PAGE - 2 * (slot + 1))
            if rec < 96:
                continue
            status = page[rec]
            if (status >> 1) & 7 != 0:  # keep primary records; skip ghosts and forwarding stubs
                continue
            fixed_end, = struct.unpack_from("<H", page, rec + 2)
            fixed = page[rec + 4:rec + fixed_end]
            columns, = struct.unpack_from("<H", page, rec + fixed_end)
            pos = rec + fixed_end + 2 + (columns + 7) // 8
            var = []
            if status & 0x20:
                count, = struct.unpack_from("<H", page, pos)
                ends = struct.unpack_from(f"<{count}H", page, pos + 2)
                begin = pos + 2 + 2 * count - rec
                for end in ends:
                    off_row = bool(end & 0x8000)
                    end &= 0x7FFF
                    var.append(None if off_row else page[rec + begin:rec + end])
                    begin = end
            yield fixed, var


def utf16(raw):
    return raw.decode("utf-16-le")


def sql_datetime(days, ticks):
    return datetime.datetime(1900, 1, 1) + datetime.timedelta(days=days, seconds=ticks / 300)


# ---------- catalog ----------

def read_catalog(data, pages):
    cat = {
        "objects": {},                      # id -> {name, type, parent, created}
        "columns": defaultdict(dict),       # table id -> {column id -> column}
        "indexes": defaultdict(dict),       # table id -> {index id -> index}
        "definitions": {},                  # object id -> SQL text
        "fks": defaultdict(lambda: {"ref_table": None, "columns": {}, "ref_columns": {}}),
    }

    for fixed, var in records(data, pages, SYSSCHOBJS):
        oid, _nsid, _nsclass, _status, typ, parent, _pclass, _intprop, ticks, days = struct.unpack_from("<iiBi2siBiIi", fixed)
        cat["objects"][oid] = {
            "name": utf16(var[0]),
            "type": typ.decode("ascii").strip(),
            "parent": parent,
            "created": sql_datetime(days, ticks),
        }

    for fixed, var in records(data, pages, SYSCOLPARS):
        oid, number, colid, xtype, utype, length, prec, scale, _coll, status, _maxinrow, _xmlns, dflt, _chk = \
            struct.unpack_from("<ihiBihBBiihiii", fixed)
        if number != 0:  # procedure parameters live here too
            continue
        cat["columns"][oid][colid] = {
            "name": utf16(var[0]), "xtype": xtype, "utype": utype, "length": length,
            "prec": prec, "scale": scale, "status": status, "default_id": dflt,
        }

    for fixed, var in records(data, pages, SYSIDXSTATS):
        oid, indid, status, _intprop, _fill, typ = struct.unpack_from("<iiiiBB", fixed)
        if indid == 0 or not var:  # heap entry
            continue
        cat["indexes"][oid][indid] = {"name": utf16(var[0]), "status": status, "type": typ, "keys": []}

    for fixed, _var in records(data, pages, SYSISCOLS):
        oid, indid, _subid, status, colid, key_ordinal = struct.unpack_from("<iiiiiB", fixed)
        index = cat["indexes"].get(oid, {}).get(indid)
        if index is not None and key_ordinal:
            index["keys"].append((key_ordinal, colid, bool(status & KEY_DESCENDING)))

    for fixed, _var in records(data, pages, SYSSINGLEOBJREFS):
        cls, fk_id, ordinal, target, target_sub, _status = struct.unpack_from("<Biiiii", fixed)
        if cls == FK_REFERENCED_TABLE:
            cat["fks"][fk_id]["ref_table"] = target
        elif cls == FK_PARENT_COLUMN:
            cat["fks"][fk_id]["columns"][ordinal] = target_sub
        elif cls == FK_REFERENCED_COLUMN:
            cat["fks"][fk_id]["ref_columns"][ordinal] = target_sub

    for fixed, var in records(data, pages, SYSOBJVALUES):
        valclass, oid, subobj, _valnum = struct.unpack_from("<Biii", fixed)
        # subobj is 0 for defaults, checks, views and triggers, 1 for stored procedures.
        if valclass != 1 or subobj not in (0, 1) or len(var) < 2:
            continue
        variant, text = var[0], var[1]
        if text is None:
            cat["definitions"][oid] = None  # stored off-row; not decoded
            continue
        # The sql_variant holds an int flag; 2 means the text is stored single-byte.
        single_byte = len(variant) >= 6 and struct.unpack_from("<i", variant, 2)[0] & 2
        cat["definitions"][oid] = text.decode("utf-8", "replace") if single_byte else utf16(text)

    return cat


def type_name(col):
    name = "sysname" if col["utype"] == SYSNAME_UTYPE else TYPE_NAMES.get(col["xtype"], f"type#{col['xtype']}")
    length = col["length"]
    if name in ("nvarchar", "nchar"):
        return f"{name}({'max' if length == -1 else length // 2})"
    if name in ("varchar", "char", "varbinary", "binary"):
        return f"{name}({'max' if length == -1 else length})"
    if name in ("decimal", "numeric"):
        return f"{name}({col['prec']},{col['scale']})"
    if name in ("datetime2", "time", "datetimeoffset"):
        return f"{name}({col['scale']})"
    return name


def build_models(cat):
    objects = cat["objects"]
    children = defaultdict(list)
    for oid, obj in objects.items():
        if obj["parent"]:
            children[obj["parent"]].append(oid)

    def named(kind, table_id):
        return sorted((objects[c]["name"], c) for c in children[table_id] if objects[c]["type"] == kind)

    models = {}
    for table_id, obj in objects.items():
        if obj["type"] != TABLE or table_id < 100 or obj["name"] in DIAGRAM_OBJECTS:
            continue
        cols = cat["columns"][table_id]
        col_name = lambda cid, cols=cols: cols[cid]["name"]

        indexes = []
        for indid, index in sorted(cat["indexes"][table_id].items()):
            keys = [col_name(cid) + (" DESC" if desc else "") for _o, cid, desc in sorted(index["keys"])]
            kind = ("PK" if index["status"] & IDX_PRIMARY_KEY
                    else "UQ" if index["status"] & IDX_UNIQUE_CONSTRAINT
                    else "UNIQUE INDEX" if index["status"] & IDX_UNIQUE
                    else "INDEX")
            indexes.append({"name": index["name"], "kind": kind, "keys": keys, "clustered": index["type"] == 1})

        fks = []
        for name, fk_id in named(FOREIGN_KEY, table_id):
            ref = cat["fks"][fk_id]
            ref_cols = cat["columns"][ref["ref_table"]]
            fks.append({
                "name": name,
                "columns": [col_name(ref["columns"][o]) for o in sorted(ref["columns"])],
                "ref_table": objects[ref["ref_table"]]["name"],
                "ref_columns": [ref_cols[ref["ref_columns"][o]]["name"] for o in sorted(ref["ref_columns"])],
            })

        models[obj["name"]] = {
            "id": table_id,
            "created": obj["created"],
            "columns": [
                {
                    "name": c["name"],
                    "type": type_name(c),
                    "nullable": not c["status"] & COL_NOT_NULL,
                    "identity": bool(c["status"] & COL_IDENTITY),
                    "computed": bool(c["status"] & COL_COMPUTED),
                    "default": cat["definitions"].get(c["default_id"]) if c["default_id"] else None,
                }
                for _cid, c in sorted(cols.items())
            ],
            "indexes": indexes,
            "fks": fks,
            "checks": [(name, cat["definitions"].get(cid)) for name, cid in named(CHECK, table_id)],
            "triggers": [name for name, _ in named(TRIGGER, table_id)],
        }
    return models


def modules(cat, kind):
    return sorted(
        (obj["name"], cat["definitions"].get(oid))
        for oid, obj in cat["objects"].items()
        if obj["type"] == kind and oid > 100 and obj["name"] not in DIAGRAM_OBJECTS and oid in cat["definitions"]
    )


def dependency_order(models):
    """Referenced tables first, so the document reads top-down."""
    ordered, seen = [], set()

    def visit(name):
        if name in seen:
            return
        seen.add(name)
        for fk in models[name]["fks"]:
            if fk["ref_table"] in models:
                visit(fk["ref_table"])
        ordered.append(name)

    for name in sorted(models):
        visit(name)
    return ordered


# ---------- markdown ----------

def strip_parens(sql):
    while sql and sql.startswith("(") and sql.endswith(")"):
        sql = sql[1:-1]
    return sql


def cell(text):
    return str(text).replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def render(bak, models, cat):
    order = dependency_order(models)
    out = []
    w = out.append

    w("# KinderLog — Mô hình dữ liệu (Database Models)")
    w("")
    w(f"Tài liệu này được sinh tự động bởi `Debug/read_bak_models.py` từ tệp sao lưu `BackUp/{bak.name}`.")
    w("Đừng sửa tay: chạy lại script khi có bản sao lưu mới.")
    w("")
    w(f"- Số bảng: **{len(models)}**")
    w(f"- Số khóa ngoại: **{sum(len(m['fks']) for m in models.values())}**")
    w(f"- View: **{len(modules(cat, VIEW))}**, stored procedure: **{len(modules(cat, PROCEDURE))}**, "
      f"trigger: **{len(modules(cat, TRIGGER))}**")
    w("")
    w("Không tính bảng `sysdiagrams` và các thủ tục `sp_*diagram*` do SSMS tự thêm cho tính năng vẽ sơ đồ.")
    w("")

    w("## Tổng quan")
    w("")
    w("| Bảng | Số cột | Khóa chính | Tham chiếu tới |")
    w("| --- | --- | --- | --- |")
    for name in order:
        m = models[name]
        pk = next((", ".join(i["keys"]) for i in m["indexes"] if i["kind"] == "PK"), "—")
        refs = ", ".join(sorted({fk["ref_table"] for fk in m["fks"]})) or "—"
        w(f"| [{name}](#{name.lower()}) | {len(m['columns'])} | {cell(pk)} | {cell(refs)} |")
    w("")

    w("## Quan hệ")
    w("")
    w("| Bảng con | Cột | Bảng cha | Cột | Ràng buộc |")
    w("| --- | --- | --- | --- | --- |")
    for name in order:
        for fk in models[name]["fks"]:
            w(f"| {name} | {', '.join(fk['columns'])} | {fk['ref_table']} | {', '.join(fk['ref_columns'])} | {fk['name']} |")
    w("")

    w("## Các bảng")
    w("")
    for name in order:
        m = models[name]
        pk_cols = {k for i in m["indexes"] if i["kind"] == "PK" for k in i["keys"]}
        fk_by_col = {}
        for fk in m["fks"]:
            for col, ref_col in zip(fk["columns"], fk["ref_columns"]):
                fk_by_col[col] = f"{fk['ref_table']}.{ref_col}"
        single_unique = {i["keys"][0] for i in m["indexes"] if i["kind"] in ("UQ", "UNIQUE INDEX") and len(i["keys"]) == 1}

        w(f"### {name}")
        w("")
        w("| Cột | Kiểu | Null | Mặc định | Ghi chú |")
        w("| --- | --- | --- | --- | --- |")
        for c in m["columns"]:
            notes = []
            if c["name"] in pk_cols:
                notes.append("PK")
            if c["identity"]:
                notes.append("IDENTITY")
            if c["name"] in fk_by_col:
                notes.append(f"FK → {fk_by_col[c['name']]}")
            if c["name"] in single_unique:
                notes.append("UNIQUE")
            if c["computed"]:
                notes.append("computed")
            default = f"`{cell(strip_parens(c['default']))}`" if c["default"] else ""
            w(f"| {c['name']} | {c['type']} | {'có' if c['nullable'] else 'không'} | {default} | {cell(', '.join(notes))} |")
        w("")

        if m["indexes"]:
            w("Khóa và chỉ mục:")
            w("")
            for i in m["indexes"]:
                kind = {"PK": "Khóa chính", "UQ": "Duy nhất", "UNIQUE INDEX": "Chỉ mục duy nhất", "INDEX": "Chỉ mục"}[i["kind"]]
                clustered = ", clustered" if i["clustered"] else ""
                w(f"- {kind} `{i['name']}` ({', '.join(i['keys'])}){clustered}")
            w("")
        if m["checks"]:
            w("Ràng buộc CHECK:")
            w("")
            for check_name, sql in m["checks"]:
                w(f"- `{check_name}`: `{strip_parens(sql) if sql else '?'}`")
            w("")
        if m["triggers"]:
            w("Trigger: " + ", ".join(f"`{t}`" for t in m["triggers"]))
            w("")

    for title, kind in (("View", VIEW), ("Stored procedure", PROCEDURE), ("Trigger", TRIGGER)):
        items = modules(cat, kind)
        if not items:
            continue
        w(f"## {title}")
        w("")
        for name, sql in items:
            w(f"### {name}")
            w("")
            if sql is None:
                w("_Định nghĩa được lưu ngoài trang dữ liệu nên script chưa đọc được._")
            else:
                w("```sql")
                w(sql.replace("\r\n", "\n").strip())
                w("```")
            w("")

    return "\n".join(out).rstrip() + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bak", type=Path, default=DEFAULT_BAK)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    data = args.bak.read_bytes()
    if data[:4] != b"TAPE":
        raise SystemExit(f"{args.bak} is not a SQL Server backup (missing TAPE header).")

    pages = load_pages(data)
    cat = read_catalog(data, pages)
    models = build_models(cat)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(args.bak, models, cat), encoding="utf-8")

    print(f"Read {len(pages)} pages, {len(models)} tables.")
    for name in dependency_order(models):
        m = models[name]
        print(f"  {name}: {len(m['columns'])} columns, {len(m['fks'])} foreign keys")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
