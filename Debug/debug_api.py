"""Debug the whole KinderLog backend from the outside.

The script builds a throwaway environment, runs every check against it and cleans up:

  1. creates the database "kinderlog_debug" with `npm run migrate`
  2. creates an admin account and starts the server on its own port
  3. calls every endpoint over HTTP and checks the answers (about 200 checks)
  4. checks that the Swagger description matches the server
  5. stops the server, drops the database and deletes the uploaded test files

The real "kinderlog" database is never touched. Only the Python standard library is used.

Usage:
    python Debug/debug_api.py              run everything, print failures and a summary
    python Debug/debug_api.py -v           also print every passing check
    python Debug/debug_api.py --only chat  run the groups whose name contains "chat"
    python Debug/debug_api.py --keep       keep the database and server log for inspection
"""

import argparse
import datetime
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BE = ROOT / "BE"
PORT = 3999
BASE = f"http://localhost:{PORT}"
API = f"{BASE}/api/v1"
DB_NAME = "kinderlog_debug"  # scripts/drop-test-db.js only drops names ending in "_debug"
ADMIN_PASSWORD = "Admin-pass-1"
WINDOWS = os.name == "nt"

for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8", errors="replace")


# ---------- environment ----------

class Environment:
    """The throwaway database, upload folder and server the checks run against."""

    def __init__(self):
        self.uploads = Path(tempfile.mkdtemp(prefix="kinderlog-debug-uploads-"))
        self.log_path = Path(tempfile.gettempdir()) / "kinderlog-debug-server.log"
        # The keyword engine keeps the checks repeatable and free: no AI call leaves this machine.
        self.env = {**os.environ, "MONGODB_DB": DB_NAME, "PORT": str(PORT), "UPLOAD_DIR": str(self.uploads), "JOURNAL_DRAFT_ENGINE": "keywords"}
        self.server = None
        self.log_file = None

    def node(self, *args, check=True):
        result = subprocess.run(
            ["node", "--env-file-if-exists=.env", *args], cwd=BE, env=self.env,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if check and result.returncode != 0:
            raise RuntimeError(f"node {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
        return result

    def start(self):
        if not (BE / "node_modules").is_dir():
            raise RuntimeError("BE/node_modules is missing. Run `npm install` in BE first.")
        if not (BE / ".env").is_file():
            raise RuntimeError("BE/.env is missing. Copy BE/.env.example and fill it in.")
        if port_in_use(PORT):
            raise RuntimeError(f"Port {PORT} is already in use. Stop the program using it and run again.")

        step("Dropping any leftover debug database")
        self.node("scripts/drop-test-db.js")
        step("Running migrations")
        applied = self.node("scripts/migrate.js", "up").stdout
        if f"Database: {DB_NAME}" not in applied:
            raise RuntimeError(f"Migrations did not run on {DB_NAME}:\n{applied}")
        step("Creating the admin account")
        self.node("scripts/create-admin.js", "admin", ADMIN_PASSWORD, "Quản trị")

        step(f"Starting the server on port {PORT}")
        self.log_file = open(self.log_path, "w", encoding="utf-8")
        self.server = subprocess.Popen(
            ["node", "--env-file-if-exists=.env", "src/index.js"], cwd=BE, env=self.env,
            stdout=self.log_file, stderr=subprocess.STDOUT,
        )
        deadline = time.time() + 40
        while time.time() < deadline:
            if self.server.poll() is not None:
                raise RuntimeError(f"The server stopped while starting:\n{self.log()}")
            try:
                if http("GET", "/health").status == 200:
                    return
            except OSError:
                pass
            time.sleep(0.5)
        raise RuntimeError(f"The server did not answer within 40 seconds:\n{self.log()}")

    def log(self):
        if self.log_file:
            self.log_file.flush()
        return self.log_path.read_text(encoding="utf-8", errors="replace") if self.log_path.exists() else ""

    def stop(self, keep):
        if self.server and self.server.poll() is None:
            self.server.terminate()
            try:
                self.server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.server.kill()
        if self.log_file:
            self.log_file.close()
        if keep:
            print(f"\nKept for inspection: database {DB_NAME}, server log {self.log_path}, uploads {self.uploads}")
            return
        shutil.rmtree(self.uploads, ignore_errors=True)
        dropped = self.node("scripts/drop-test-db.js", check=False)
        if dropped.returncode != 0:
            print(f"Could not drop {DB_NAME}: {dropped.stdout}{dropped.stderr}")


def port_in_use(port):
    with socket.socket() as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def step(text):
    print(f"  · {text}")


# ---------- HTTP ----------

class Response:
    def __init__(self, status, raw, headers):
        self.status = status
        self.raw = raw
        self.headers = headers
        try:
            self.json = json.loads(raw.decode("utf-8")) if raw else None
        except ValueError:
            self.json = None

    @property
    def code(self):
        return self.json["error"].get("code") if isinstance(self.json, dict) and isinstance(self.json.get("error"), dict) else None

    @property
    def fields(self):
        return (self.json or {}).get("error", {}).get("fields", {}) if isinstance(self.json, dict) else {}

    def __getitem__(self, key):
        return self.json[key]

    def get(self, key, default=None):
        return self.json.get(key, default) if isinstance(self.json, dict) else default

    def brief(self):
        text = self.raw.decode("utf-8", errors="replace")
        return f"HTTP {self.status} {text[:300]}"


class File:
    def __init__(self, name, content, content_type):
        self.name, self.content, self.content_type = name, content, content_type


def multipart(form):
    """Encodes a dict of text fields and File objects as multipart/form-data."""
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in form.items():
        if isinstance(value, File):
            head = f'Content-Disposition: form-data; name="{name}"; filename="{value.name}"\r\nContent-Type: {value.content_type}\r\n\r\n'
            parts.append(f"--{boundary}\r\n{head}".encode() + value.content + b"\r\n")
        else:
            head = f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            parts.append(f"--{boundary}\r\n{head}{value}\r\n".encode("utf-8"))
    return b"".join(parts) + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"


def http(method, path, body=None, token=None, form=None, raw=None, headers=None, base=API):
    data, request_headers = None, dict(headers or {})
    if form is not None:
        data, request_headers["Content-Type"] = multipart(form)
    elif raw is not None:
        data, request_headers["Content-Type"] = raw.encode("utf-8"), "application/json"
    elif body is not None:
        data, request_headers["Content-Type"] = json.dumps(body).encode("utf-8"), "application/json"
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    url = path if path.startswith("http") else base + path
    request = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return Response(response.status, response.read(), response.headers)
    except urllib.error.HTTPError as error:
        return Response(error.code, error.read(), error.headers)


# ---------- reporting ----------

class Report:
    def __init__(self, verbose):
        self.verbose = verbose
        self.group = ""
        self.results = []  # (group, label, ok, detail)

    def start(self, group, title):
        self.group = group
        print(f"\n[{group}] {title}")

    def check(self, label, ok, detail=None):
        ok = bool(ok)
        self.results.append((self.group, label, ok, detail))
        if not ok:
            shown = detail.brief() if isinstance(detail, Response) else json.dumps(detail, ensure_ascii=False, default=str)[:400]
            print(f"  FAIL  {label}\n        {shown}")
        elif self.verbose:
            print(f"  ok    {label}")
        return ok

    def expect(self, label, response, status, code=None):
        """The response must have this HTTP status and, when given, this error code."""
        return self.check(label, response.status == status and (code is None or response.code == code), response)

    def summary(self):
        groups = {}
        for group, _label, ok, _detail in self.results:
            passed, total = groups.get(group, (0, 0))
            groups[group] = (passed + ok, total + 1)
        print("\n" + "=" * 46)
        for group, (passed, total) in groups.items():
            print(f"  {group:<16}{passed:>4} / {total:<4}{'' if passed == total else '  <-- failures'}")
        failed = [r for r in self.results if not r[2]]
        print("=" * 46)
        print(f"  {len(self.results) - len(failed)} passed, {len(failed)} failed")
        for group, label, _ok, _detail in failed:
            print(f"    - [{group}] {label}")
        return not failed


def day(offset=0):
    return (datetime.date.today() + datetime.timedelta(days=offset)).isoformat()


TODAY = day()


# ---------- test data ----------

class World:
    """Accounts, classes and children created through the admin endpoints, shared by every group."""

    def login(self, **body):
        response = http("POST", "/auth/login", body)
        if response.status != 200:
            raise RuntimeError(f"Could not sign in as {body}: {response.brief()}")
        return response.json

    def create(self, path, **body):
        response = http("POST", f"/admin/{path}", body, self.A)
        if response.status != 201:
            raise RuntimeError(f"Could not create {path} {body}: {response.brief()}")
        return response.json

    def build(self):
        self.admin = self.login(username="admin", password=ADMIN_PASSWORD)
        self.A = self.admin["accessToken"]

        user = lambda username, name, role, phone, **extra: self.create(
            "users", username=username, password="123456", fullName=name, role=role, phoneNumber=phone, **extra)
        self.mai = user("mai", "Nguyễn Thị Mai", "TEACHER", "0903000001", email="mai@kinderstars.edu.vn")
        self.ha = user("ha", "Phạm Thu Hà", "TEACHER", "0903000002")
        self.anh = user("anh", "Lê Ngọc Ánh", "TEACHER", "0903000003")  # leads no class
        self.huong = user("huong", "Nguyễn Thị Hương", "PARENT", "0904000001", email="huong@gmail.com")
        self.tuan = user("tuan", "Trần Văn Tuấn", "PARENT", "0904000002")
        self.tam = user("tam", "Nguyễn Thanh Tâm", "PARENT", "0904000003")

        cls = lambda code, name, teacher: self.create(
            "classes", classCode=code, className=name, gradeLevel="Mầm", schoolYear="2026-2027", teacherId=teacher["id"])
        self.c1 = cls("MT1", "Mặt Trời 1", self.mai)
        self.c2 = cls("MT2", "Mặt Trời 2", self.ha)

        student = lambda code, name, cls_, **extra: self.create(
            "students", studentCode=code, fullName=name, dateOfBirth="2022-03-14", gender="Male", classId=cls_["id"], **extra)
        self.an = student("S1", "Nguyễn Minh An", self.c1, allergyHistory="Dị ứng sữa bò", healthNote="Hay ho về chiều")
        self.ngoc = student("S2", "Trần Bảo Ngọc", self.c1)
        self.huy = student("S3", "Lê Gia Huy", self.c1)
        self.gone = student("S4", "Bạn Đã Nghỉ", self.c1, isActive=False)
        self.phuc = student("S5", "Nguyễn Hoàng Phúc", self.c2)

        link = lambda parent, child, relationship, **extra: self.create(
            "parent-student-maps", parentId=parent["id"], studentId=child["id"], relationship=relationship, **extra)
        link(self.huong, self.an, "Mẹ")
        link(self.tuan, self.ngoc, "Cha")
        link(self.tam, self.phuc, "Mẹ")
        link(self.tam, self.huy, "Khác", isActive=False)  # an inactive link gives no access

        self.mai_session = self.login(phone="0903000001", password="123456", role="teacher", remember=True)
        self.T = self.mai_session["accessToken"]                                      # teacher of class 1
        self.T2 = self.login(phone="0903000002", password="123456")["accessToken"]    # teacher of class 2
        self.T3 = self.login(phone="0903000003", password="123456")["accessToken"]    # teacher without a class
        self.P = self.login(phone="0904000001", password="123456", role="parent")["accessToken"]  # mother of An
        self.P2 = self.login(phone="0904000002", password="123456")["accessToken"]    # father of Ngọc
        self.P3 = self.login(phone="0904000003", password="123456")["accessToken"]    # parent in class 2


# ---------- check groups ----------
# Groups run in this order and build on each other: the journal group publishes the journal
# whose notifications the inbox group reads, and the account group runs last because it
# changes passwords and locks accounts.

def group_system(r, w, env):
    r.start("system", "Health, unknown routes, malformed requests")
    health = http("GET", "/health")
    r.check("health reports the database", health.status == 200 and health.json == {"status": "ok", "database": "ok"}, health)
    r.expect("unknown route", http("GET", "/nope", token=w.A), 404, "NOT_FOUND")
    r.expect("malformed JSON body", http("POST", "/auth/login", raw="{bad"), 400, "BAD_REQUEST")
    r.expect("no token", http("GET", "/me"), 401, "UNAUTHENTICATED")
    r.expect("garbage token", http("GET", "/me", token="abc"), 401, "UNAUTHENTICATED")
    r.expect("wrong scheme in Authorization", http("GET", "/me", headers={"Authorization": f"Basic {w.A}"}), 401, "UNAUTHENTICATED")
    allowed = http("OPTIONS", "/me", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    r.check("CORS allows the frontend origin", allowed.headers.get("access-control-allow-origin") == "http://localhost:5173", dict(allowed.headers))
    other = http("GET", "/health", headers={"Origin": "http://evil.test"})
    r.check("CORS does not allow other origins", other.headers.get("access-control-allow-origin") is None, dict(other.headers))


def group_auth(r, w, env):
    r.start("auth", "Sign-in")
    admin = w.admin
    r.check("admin signs in by username", admin["user"]["role"] == "admin" and admin["user"]["roleLabel"] == "System Admin" and admin["refreshToken"], admin)
    r.expect("wrong role is refused", http("POST", "/auth/login", {"phone": "0903000001", "password": "123456", "role": "parent"}), 401, "INVALID_CREDENTIALS")
    r.expect("wrong password", http("POST", "/auth/login", {"phone": "0903000001", "password": "nope"}), 401, "INVALID_CREDENTIALS")
    r.expect("unknown phone", http("POST", "/auth/login", {"phone": "0999999999", "password": "123456"}), 401, "INVALID_CREDENTIALS")
    r.expect("query operators instead of strings", http("POST", "/auth/login", {"phone": {"$ne": None}, "password": {"$ne": None}}), 400, "VALIDATION_ERROR")
    r.expect("missing password", http("POST", "/auth/login", {"phone": "0903000001"}), 400, "VALIDATION_ERROR")
    r.expect("invalid role value", http("POST", "/auth/login", {"phone": "0903000001", "password": "123456", "role": "principal"}), 400, "VALIDATION_ERROR")
    user = w.mai_session["user"]
    r.check("teacher signs in by phone", user["role"] == "teacher" and user["name"] == "Nguyễn Thị Mai" and user["phone"] == "0903000001"
            and user["status"] == "Active" and user["class"]["name"] == "Mặt Trời 1" and isinstance(user["lastLogin"], int), user)
    r.check("password hash never leaves the server", "passwordHash" not in json.dumps(w.mai_session) and "passwordHash" not in json.dumps(admin))
    me = http("GET", "/me", token=w.P)
    children = me.get("children") or []
    r.check("parent profile lists their children", len(children) == 1 and children[0]["name"] == "Nguyễn Minh An"
            and children[0]["relationship"] == "Mother" and children[0]["className"] == "Mặt Trời 1", me)


def group_roster(r, w, env):
    r.start("roster", "PB09 - class roster and dashboard")
    roster = http("GET", "/teacher/class", token=w.T)
    students = roster.get("students") or []
    names = [s["name"] for s in students]
    r.check("only active students of the teacher's class", roster.status == 200 and roster["class"]["name"] == "Mặt Trời 1"
            and len(students) == 3 and "Bạn Đã Nghỉ" not in names and "Nguyễn Hoàng Phúc" not in names, roster)
    an = next((s for s in students if s["id"] == w.an["id"]), {})
    r.check("student note, parent and relationship label", an.get("note") == "Dị ứng sữa bò · Hay ho về chiều" and an.get("dob") == "2022-03-14"
            and an.get("today") is None and an["parents"][0] == {"id": w.huong["id"], "name": "Nguyễn Thị Hương", "phone": "0904000001", "relationship": "Mother"}, an)
    huy = next((s for s in students if s["id"] == w.huy["id"]), {})
    r.check("inactive parent link is hidden", huy.get("parents") == [], huy)
    r.expect("teacher without a class", http("GET", "/teacher/class", token=w.T3), 404, "NO_CLASS")
    empty = http("GET", "/teacher/dashboard", token=w.T3)
    r.check("dashboard without a class", empty.status == 200 and empty["class"] is None and "students" not in empty.json, empty)
    r.expect("parents may not read the roster", http("GET", "/teacher/class", token=w.P), 403, "FORBIDDEN")
    r.expect("admins may not read the roster", http("GET", "/teacher/class", token=w.A), 403, "FORBIDDEN")


def group_attendance(r, w, env):
    r.start("attendance", "PB11 - attendance sheet")
    an, ngoc, huy, phuc = w.an["id"], w.ngoc["id"], w.huy["id"], w.phuc["id"]
    sheet = http("GET", f"/attendance?date={TODAY}", token=w.T)
    r.check("empty sheet", sheet.status == 200 and sheet["savedAt"] is None and sheet["records"] == {}
            and sheet["counts"] == {"total": 3, "present": 0, "absent": 0, "unrecorded": 3, "recorded": False}, sheet)
    saved = http("PUT", "/attendance", {"classId": w.c1["id"], "date": TODAY, "records": {
        an: {"status": "present", "note": ""}, ngoc: {"status": "absent", "note": "Sốt nhẹ"}}}, w.T)
    r.check("save a partial sheet", saved.status == 200 and saved["records"][ngoc] == {"status": "absent", "note": "Sốt nhẹ"} and isinstance(saved["savedAt"], int)
            and saved["counts"] == {"total": 3, "present": 1, "absent": 1, "unrecorded": 1, "recorded": True}, saved)
    again = http("PUT", "/attendance", {"date": TODAY, "records": {an: {"status": "absent", "note": "Về sớm"}, huy: {"status": "late"}}}, w.T)
    r.check("saving again replaces the sheet", again.status == 200 and again["records"][an]["status"] == "absent" and ngoc not in again["records"]
            and again["records"][huy]["status"] == "late" and again["counts"]["present"] == 1 and again["counts"]["absent"] == 1, again)
    reread = http("GET", f"/attendance?date={TODAY}", token=w.T)
    r.check("the saved sheet is what is read back", reread.json and reread["records"] == again["records"], reread)
    r.expect("child of another class", http("PUT", "/attendance", {"date": TODAY, "records": {phuc: {"status": "present"}}}, w.T), 400, "VALIDATION_ERROR")
    r.expect("future date", http("PUT", "/attendance", {"date": day(1), "records": {}}, w.T), 400, "VALIDATION_ERROR")
    r.expect("unknown status", http("PUT", "/attendance", {"date": TODAY, "records": {an: {"status": "sick"}}}, w.T), 400, "VALIDATION_ERROR")
    r.expect("bad date format", http("PUT", "/attendance", {"date": "11/10/2026", "records": {}}, w.T), 400, "VALIDATION_ERROR")
    r.expect("records is not an object", http("PUT", "/attendance", {"date": TODAY, "records": []}, w.T), 400, "VALIDATION_ERROR")
    r.expect("note longer than 255 characters", http("PUT", "/attendance", {"date": TODAY, "records": {an: {"status": "present", "note": "x" * 256}}}, w.T), 400, "VALIDATION_ERROR")
    r.expect("reading another teacher's class", http("GET", f"/attendance?classId={w.c2['id']}&date={TODAY}", token=w.T), 403, "FORBIDDEN")
    r.expect("saving another teacher's class", http("PUT", "/attendance", {"classId": w.c2["id"], "date": TODAY, "records": {}}, w.T), 403, "FORBIDDEN")
    admin_view = http("GET", f"/attendance?classId={w.c1['id']}&date={TODAY}", token=w.A)
    r.check("admin reads any class", admin_view.status == 200 and admin_view["counts"]["recorded"], admin_view)
    r.expect("admin needs a class id", http("GET", f"/attendance?date={TODAY}", token=w.A), 404, "NOT_FOUND")
    r.expect("admin cannot save", http("PUT", "/attendance", {"classId": w.c1["id"], "date": TODAY, "records": {}}, w.A), 403, "FORBIDDEN")
    r.expect("parents cannot read the sheet", http("GET", f"/attendance?date={TODAY}", token=w.P), 403, "FORBIDDEN")
    roster = http("GET", "/teacher/class", token=w.T)
    today_of = {s["id"]: s["today"] for s in roster.get("students", [])}
    r.check("roster shows today's attendance", today_of.get(an) == "absent" and today_of.get(huy) == "late" and today_of.get(ngoc) is None, today_of)


def group_uploads(r, w, env):
    r.start("uploads", "PB16 - photo upload")
    png = b"\x89PNG\r\n\x1a\n\x00\x00"
    image = lambda purpose: {"purpose": purpose, "file": File("../../evil.png", png, "image/png")}
    first = http("POST", "/uploads", token=w.T, form=image("journal-photo"))
    w.photo1 = first.get("url")
    r.check("image is stored under a random name", first.status == 201 and re.search(r"/uploads/[0-9a-f]{32}\.png$", w.photo1 or "")
            and first["contentType"] == "image/png" and first["size"] == len(png), first)
    served = http("GET", w.photo1) if w.photo1 else None
    r.check("uploaded file is served back unchanged", served is not None and served.status == 200 and served.raw == png, served)
    w.photo2 = http("POST", "/uploads", token=w.T, form=image("journal-photo")).get("url")
    stored = [p.name for p in env.uploads.iterdir()]
    r.check("client file name cannot leave the upload folder", all(re.fullmatch(r"[0-9a-f]{32}\.\w+", n) for n in stored) and not (env.uploads.parent / "evil.png").exists(), stored)
    r.expect("teacher cannot upload a student photo", http("POST", "/uploads", token=w.T, form=image("student-photo")), 403, "FORBIDDEN")
    r.expect("admin uploads a student photo", http("POST", "/uploads", token=w.A, form=image("student-photo")), 201)
    r.expect("unknown purpose", http("POST", "/uploads", token=w.T, form=image("other")), 400, "VALIDATION_ERROR")
    r.expect("no file", http("POST", "/uploads", token=w.T, form={"purpose": "journal-photo"}), 400, "VALIDATION_ERROR")
    html = {"purpose": "journal-photo", "file": File("x.html", b"<script>", "text/html")}
    r.expect("a non-image is refused", http("POST", "/uploads", token=w.T, form=html), 400, "VALIDATION_ERROR")
    big = {"purpose": "journal-photo", "file": File("big.png", png + b"\x00" * (5 * 1024 * 1024 + 1), "image/png")}
    r.expect("a file over 5 MB is refused", http("POST", "/uploads", token=w.T, form=big), 400, "VALIDATION_ERROR")
    r.expect("parents may not upload", http("POST", "/uploads", token=w.P, form=image("journal-photo")), 403, "FORBIDDEN")
    r.expect("no directory listing", http("GET", f"{BASE}/uploads/"), 404)


def group_voice(r, w, env):
    r.start("voice", "PB14 - voice draft")
    said = "Hôm nay các con ăn ngon miệng. Bé An ngủ hơi muộn. Cả lớp học vẽ tranh. Các bạn nam chơi đá bóng! Nhớ mang áo khoác"
    draft = http("POST", "/journals/voice-draft", {"transcript": said}, w.T)
    w.draft = draft.json
    r.check("sentences are sorted into sections", draft.status == 200 and draft["sections"]["meal"] == "Hôm nay các con ăn ngon miệng."
            and draft["sections"]["learning"] == "Cả lớp học vẽ tranh. Các bạn nam chơi đá bóng." and draft["sections"]["note"] == "Nhớ mang áo khoác.", draft)
    r.check("a sentence naming a child becomes a personal note", draft.status == 200 and draft["personal"] == {w.an["id"]: "Bé An ngủ hơi muộn."}, draft)
    r.check("'các bạn nam' is not a child called Nam", draft.status == 200 and "Các bạn nam" in draft["sections"]["learning"], draft)
    r.check("no recording means audioUrl is null", draft.status == 200 and draft["audioUrl"] is None, draft)
    r.check("the response says which engine made the draft", draft.status == 200 and draft["engine"] == "keywords" and draft["entries"] == [], draft)

    # The AI engine returns structured entries; building the draft from them is plain code, checked here without any AI call.
    an, ngoc = w.an["id"], w.ngoc["id"]
    entries = [
        {"section": "meal", "status": "all", "students": [], "text": "Cả lớp ăn hết suất."},
        {"section": "meal", "status": "named", "students": [an], "text": "Bé An ăn ít."},
        {"section": "sleep", "status": "part", "students": [], "text": "Một vài bạn khó ngủ."},
        {"section": "sleep", "status": "part", "students": [an, ngoc, an], "text": "An và Ngọc không ngủ trưa."},
        {"section": "health", "status": "nobody", "students": [an], "text": "Không bạn nào bị ốm."},
        {"section": "emotion", "status": "named", "students": ["000000000000000000000000"], "text": "Bé lạ rất vui."},
        {"section": "weather", "status": "all", "students": [], "text": "Trời đẹp."},
        {"section": "note", "status": "all", "students": [], "text": "   "},
    ]
    script = ("import { assembleDraft } from './src/utils/journal-draft.js'; "
              "const [entries, students] = JSON.parse(process.argv[1]); "
              "console.log(JSON.stringify(assembleDraft(entries, students)))")
    built = json.loads(env.node("--input-type=module", "-e", script, json.dumps([entries, [{"id": an}, {"id": ngoc}]])).stdout)
    r.check("entries: class-wide statements join their section", built["sections"]["meal"] == "Cả lớp ăn hết suất." and built["sections"]["sleep"] == "Một vài bạn khó ngủ."
            and built["sections"]["health"] == "Không bạn nào bị ốm.", built["sections"])
    r.check("entries: statements about listed children become private notes",
            built["personal"] == {an: "Bé An ăn ít. An và Ngọc không ngủ trưa.", ngoc: "An và Ngọc không ngủ trưa."}, built["personal"])
    r.check("entries: unknown children, unknown sections and empty text are dropped",
            len(built["entries"]) == 5 and built["sections"]["emotion"] == "" and built["sections"]["note"] == "", built["entries"])
    full_name = http("POST", "/journals/voice-draft", {"transcript": "Trần Bảo Ngọc hôm nay ăn ít. Bé Phúc rất ngoan"}, w.T)
    r.check("full name matches; a child of another class does not", full_name.status == 200 and list(full_name["personal"]) == [w.ngoc["id"]]
            and "Bé Phúc rất ngoan." in full_name["sections"]["emotion"], full_name)
    r.expect("nothing was said", http("POST", "/journals/voice-draft", {"transcript": "   "}, w.T), 422, "NO_SPEECH")
    webm = b"\x1aE\xdf\xa3" + b"\x00" * 2048
    only_audio = {"audio": File("rec.webm", webm, "audio/webm;codecs=opus")}
    r.expect("audio without a transcript", http("POST", "/journals/voice-draft", token=w.T, form=only_audio), 502, "AI_UNAVAILABLE")
    both = http("POST", "/journals/voice-draft", token=w.T, form={"transcript": "Các con ngủ trưa ngon", "audio": File("rec.webm", webm, "audio/webm")})
    w.recording = both.get("audioUrl")
    r.check("audio with a transcript", both.status == 200 and both["sections"]["sleep"] == "Các con ngủ trưa ngon."
            and re.search(r"/uploads/[0-9a-f]{32}\.webm$", w.recording or ""), both)
    r.expect("wrong audio file type", http("POST", "/journals/voice-draft", token=w.T, form={"audio": File("x.txt", b"hi", "text/plain")}), 400, "VALIDATION_ERROR")
    r.expect("teacher without a class", http("POST", "/journals/voice-draft", {"transcript": "x"}, w.T3), 404, "NO_CLASS")
    r.expect("parents may not draft", http("POST", "/journals/voice-draft", {"transcript": "x"}, w.P), 403, "FORBIDDEN")


def group_journal(r, w, env):
    r.start("journal", "PB12/13/15/16 - class journal")
    an, ngoc, huy = w.an["id"], w.ngoc["id"], w.huy["id"]
    created = http("POST", "/journals", {"date": TODAY, "source": "manual"}, w.T)
    j = created.json or {}
    jid = j.get("id")
    w.journal_id = jid
    r.check("create a manual journal", created.status == 201 and j["status"] == "draft" and j["source"] == "manual" and j["date"] == TODAY
            and j["classId"] == w.c1["id"] and set(j["sections"].values()) == {""} and j["publishedAt"] is None and j["photos"] == [] and j["personal"] == {}, created)
    r.expect("one journal per class per day", http("POST", "/journals", {"date": TODAY}, w.T), 409, "JOURNAL_EXISTS")
    r.expect("future date", http("POST", "/journals", {"date": day(1)}, w.T), 400, "VALIDATION_ERROR")
    r.expect("missing date", http("POST", "/journals", {}, w.T), 400, "VALIDATION_ERROR")
    r.expect("unknown source", http("POST", "/journals", {"date": day(-9), "source": "robot"}, w.T), 400, "VALIDATION_ERROR")
    r.expect("approve while empty", http("POST", f"/journals/{jid}/approve", token=w.T), 422, "INVALID_STATE")
    r.expect("publish before approval", http("POST", f"/journals/{jid}/publish", token=w.T), 422, "INVALID_STATE")

    content = {
        "sections": {"meal": "Các con ăn hết suất cơm.", "learning": "Cả lớp học đếm số.", "sleep": "", "health": "", "emotion": "Vui vẻ.", "note": ""},
        "personal": {an: "Bé An hơi ho.", ngoc: "   "},
        "photos": [w.photo1, w.photo2],
    }
    put = lambda body, token=None: http("PUT", f"/journals/{jid}", body, token or w.T)
    saved = put(content)
    r.check("save the draft", saved.status == 200 and saved["sections"] == content["sections"] and saved["status"] == "draft", saved)
    r.check("an empty personal note is dropped", saved.status == 200 and saved["personal"] == {an: "Bé An hơi ho."}, saved)
    r.check("photos keep their order", saved.status == 200 and saved["photos"] == [w.photo1, w.photo2], saved)
    r.expect("note about a child of another class", put({**content, "personal": {w.phuc["id"]: "x"}}), 400, "VALIDATION_ERROR")
    r.expect("note about an inactive child", put({**content, "personal": {w.gone["id"]: "x"}}), 400, "VALIDATION_ERROR")
    r.expect("more photos than the setting allows", put({**content, "photos": [w.photo1] * 7}), 400, "VALIDATION_ERROR")
    r.expect("a section longer than 2000 characters", put({**content, "sections": {"meal": "x" * 2001}}), 400, "VALIDATION_ERROR")
    r.expect("sections is not an object", put({**content, "sections": "text"}), 400, "VALIDATION_ERROR")
    unchanged = http("GET", f"/journals/{jid}", token=w.T)
    r.check("a refused save changes nothing", unchanged.status == 200 and unchanged["sections"] == content["sections"] and len(unchanged["photos"]) == 2, unchanged)
    r.expect("another teacher cannot read it", http("GET", f"/journals/{jid}", token=w.T2), 404, "NOT_FOUND")
    r.expect("another teacher cannot change it", put(content, w.T2), 404, "NOT_FOUND")
    r.expect("another teacher cannot publish it", http("POST", f"/journals/{jid}/publish", token=w.T2), 404, "NOT_FOUND")
    r.expect("parents cannot use the teacher endpoints", http("GET", f"/journals/{jid}", token=w.P), 403, "FORBIDDEN")

    approved = http("POST", f"/journals/{jid}/approve", token=w.T)
    r.check("approve", approved.status == 200 and approved["status"] == "approved", approved)
    same = put(content)
    r.check("saving unchanged content keeps the approval", same.status == 200 and same["status"] == "approved", same)
    changed = put({**content, "photos": [w.photo2]})
    r.check("a change after approval needs approval again", changed.status == 200 and changed["status"] == "draft" and changed["photos"] == [w.photo2], changed)
    put(content)
    http("POST", f"/journals/{jid}/approve", token=w.T)
    published = http("POST", f"/journals/{jid}/publish", token=w.T)
    r.check("publish", published.status == 200 and published["status"] == "published" and isinstance(published["publishedAt"], int), published)
    r.expect("publish twice", http("POST", f"/journals/{jid}/publish", token=w.T), 422, "INVALID_STATE")
    r.expect("edit after publishing", put(content), 422, "INVALID_STATE")
    r.expect("approve after publishing", http("POST", f"/journals/{jid}/approve", token=w.T), 422, "INVALID_STATE")
    r.expect("record after publishing", http("POST", f"/journals/{jid}/recordings", w.draft, w.T), 422, "INVALID_STATE")

    voice = http("POST", "/journals", {"date": day(-1), "source": "voice", "sections": w.draft["sections"], "personal": w.draft["personal"],
                                       "transcript": w.draft["transcript"], "audio": [w.recording]}, w.T)
    v = voice.json or {}
    r.check("create from a voice draft starts in review", voice.status == 201 and v["status"] == "review" and v["source"] == "voice"
            and v["audio"] == [w.recording] and v["transcript"].startswith("Hôm nay") and v["personal"] == {an: "Bé An ngủ hơi muộn."}, voice)
    http("POST", f"/journals/{v.get('id')}/approve", token=w.T)
    more = http("POST", f"/journals/{v.get('id')}/recordings", {"sections": {"meal": "Bữa xế có sữa."}, "personal": {an: "An tự xúc cơm.", huy: "Huy ngủ ngoan."},
                                                                 "transcript": "Bữa xế có sữa", "audioUrl": w.recording}, w.T)
    r.check("a recording is appended, never replaces", more.status == 200 and more["sections"]["meal"] == "Hôm nay các con ăn ngon miệng. Bữa xế có sữa."
            and more["personal"] == {an: "Bé An ngủ hơi muộn. An tự xúc cơm.", huy: "Huy ngủ ngoan."} and len(more["audio"]) == 2
            and more["transcript"].endswith("Bữa xế có sữa"), more)
    r.check("a recording sends an approved journal back to review", more.status == 200 and more["status"] == "review", more)
    manual = http("POST", "/journals", {"date": day(-2)}, w.T).get("id")
    http("POST", f"/journals/{manual}/recordings", {"sections": {"sleep": "Ngủ ngon."}, "transcript": "Ngủ ngon"}, w.T)
    turned = http("GET", f"/journals/{manual}", token=w.T)
    r.check("a recording turns a manual journal into a voice one", turned.status == 200 and turned["source"] == "voice" and turned["status"] == "review", turned)

    history = http("GET", "/journals", token=w.T)
    items = history.get("items") or []
    r.check("history is newest first", [i["date"] for i in items] == [TODAY, day(-1), day(-2)] and items[0]["status"] == "published", history)
    count = lambda query: len(http("GET", f"/journals{query}", token=w.T).get("items") or [])
    r.check("history filters", (count("?status=published"), count("?status=review"), count("?status=draft"), count(f"?date={TODAY}")) == (1, 2, 0, 1))
    r.check("another teacher's history is separate", http("GET", "/journals", token=w.T2).get("items") == [])
    r.expect("unknown status filter", http("GET", "/journals?status=x", token=w.T), 400, "VALIDATION_ERROR")
    r.expect("malformed journal id", http("GET", "/journals/abc", token=w.T), 404, "NOT_FOUND")
    r.expect("unknown journal id", http("GET", "/journals/64b000000000000000000000", token=w.T), 404, "NOT_FOUND")

    dashboard = http("GET", "/teacher/dashboard", token=w.T)
    r.check("dashboard numbers", dashboard.status == 200 and dashboard["class"]["name"] == "Mặt Trời 1" and dashboard["students"] == 3 and dashboard["date"] == TODAY
            and dashboard["attendance"]["present"] == 1 and dashboard["attendance"]["absent"] == 1 and dashboard["journal"] == {"id": jid, "status": "published"}
            and dashboard["pendingReviews"] == 2 and dashboard["unreadMessages"] == 0, dashboard)


def group_inbox(r, w, env):
    r.start("inbox", "Notifications")
    mine = http("GET", "/notifications", token=w.P)
    items = mine.get("items") or []
    titles = {i["title"]: i for i in items}
    r.check("parent of a child with a note gets two", len(items) == 2 and all(i["type"] == "journal" and i["read"] is False and isinstance(i["at"], int) for i in items), mine)
    r.check("class notification text", titles.get("New journal published", {}).get("body") == "The daily journal for Mặt Trời 1 is ready to view.", mine)
    r.check("personal-note notification text", titles.get("A note about Nguyễn Minh An", {}).get("body") == "The teacher wrote a personal note in today's journal.", mine)
    other = http("GET", "/notifications", token=w.P2).get("items") or []
    r.check("another parent of the class gets only the class one", [i["title"] for i in other] == ["New journal published"], other)
    r.check("a parent of another class gets none", http("GET", "/notifications", token=w.P3).get("items") == [])
    r.check("unread count", http("GET", "/notifications/unread-count", token=w.P).json == {"count": 2})
    r.expect("mark one as read", http("POST", "/notifications/read", {"ids": [items[0]["id"]]} if items else {}, w.P), 204)
    http("POST", "/notifications/read", {"ids": [items[1]["id"]]} if len(items) > 1 else {}, w.P2)
    r.check("someone else cannot mark mine", http("GET", "/notifications/unread-count", token=w.P).json == {"count": 1})
    r.check("unread filter", len(http("GET", "/notifications?unread=true", token=w.P).get("items") or []) == 1)
    http("POST", "/notifications/read", {"all": True}, w.P)
    r.check("mark all as read", http("GET", "/notifications/unread-count", token=w.P).json == {"count": 0})
    r.expect("malformed ids", http("POST", "/notifications/read", {"ids": ["x"]}, w.P), 400, "VALIDATION_ERROR")
    r.expect("neither ids nor all", http("POST", "/notifications/read", {}, w.P), 400, "VALIDATION_ERROR")


def group_chat(r, w, env):
    r.start("chat", "PB17 - messages")
    mai, huong, tuan, tam = w.mai["id"], w.huong["id"], w.tuan["id"], w.tam["id"]
    mine = http("GET", "/conversations", token=w.T)
    peers = {c["peerId"]: c for c in mine.get("items") or []}
    r.check("teacher sees the active parents of the class", set(peers) == {huong, tuan} and peers[huong]["sub"] == "Mother of Nguyễn Minh An"
            and peers[tuan]["sub"] == "Father of Trần Bảo Ngọc" and peers[huong]["last"] is None and peers[huong]["unread"] == 0, mine)
    theirs = http("GET", "/conversations", token=w.P)
    r.check("parent sees the class teacher", [(c["peerId"], c["sub"]) for c in theirs.get("items") or []] == [(mai, "Teacher · Mặt Trời 1")], theirs)
    r.check("teacher without a class has no conversations", http("GET", "/conversations", token=w.T3).get("items") == [])
    long_text = "Chào cô Mai, chiều nay em đón bé sớm lúc 4 giờ được không cô? Em cảm ơn cô nhiều ạ."
    sent = http("POST", f"/conversations/{mai}/messages", {"text": f"  {long_text}  "}, w.P)
    r.check("parent sends; text is trimmed", sent.status == 201 and sent["from"] == "parent" and sent["read"] is False and sent["parentId"] == huong
            and sent["teacherId"] == mai and sent["text"] == long_text, sent)
    http("POST", f"/conversations/{mai}/messages", {"text": "Tin thứ hai"}, w.P)
    r.check("teacher's unread count", http("GET", "/conversations/unread-count", token=w.T).json == {"count": 2})
    top = (http("GET", "/conversations", token=w.T).get("items") or [{}])[0]
    r.check("newest conversation comes first", top.get("peerId") == huong and top.get("unread") == 2 and top["last"]["text"] == "Tin thứ hai" and top["last"]["from"] == "parent", top)
    found = lambda q: len(http("GET", f"/conversations?q={urllib.request.quote(q)}", token=w.T).get("items") or [])
    r.check("search ignores accents and case", (found("huong"), found("TRAN bao"), found("hương"), found("zzz")) == (1, 1, 1, 0))
    notes = http("GET", "/notifications", token=w.T).get("items") or []
    preview = next((n for n in notes if n["body"].startswith("Chào cô Mai")), {})
    r.check("receiver is notified with a 70-character preview", len(notes) == 2 and preview.get("type") == "message"
            and preview.get("title") == "Message from Nguyễn Thị Hương" and preview.get("body") == long_text[:70] + "…", notes)
    thread = http("GET", f"/conversations/{huong}/messages", token=w.T).get("items") or []
    r.check("messages are oldest first", [m["text"] for m in thread] == [long_text, "Tin thứ hai"], thread)
    newest = http("GET", f"/conversations/{huong}/messages?limit=1", token=w.T).get("items") or [{}]
    r.check("limit returns the newest", [m.get("text") for m in newest] == ["Tin thứ hai"], newest)
    older = http("GET", f"/conversations/{huong}/messages?before={newest[0].get('at')}", token=w.T).get("items") or []
    r.check("before pages back", [m["text"] for m in older] == [long_text], older)
    r.expect("bad before value", http("GET", f"/conversations/{huong}/messages?before=abc", token=w.T), 400, "VALIDATION_ERROR")
    r.expect("mark the conversation read", http("POST", f"/conversations/{huong}/read", token=w.T), 204)
    seen = http("GET", f"/conversations/{mai}/messages", token=w.P).get("items") or []
    r.check("read state reaches the sender", http("GET", "/conversations/unread-count", token=w.T).json == {"count": 0} and seen and all(m["read"] for m in seen), seen)
    reply = http("POST", f"/conversations/{huong}/messages", {"text": "Dạ được chị nhé."}, w.T)
    r.check("teacher replies", reply.status == 201 and reply["from"] == "teacher" and http("GET", "/conversations/unread-count", token=w.P).json == {"count": 1}, reply)
    r.expect("empty message", http("POST", f"/conversations/{huong}/messages", {"text": "   "}, w.T), 400, "VALIDATION_ERROR")
    r.expect("message longer than 2000 characters", http("POST", f"/conversations/{huong}/messages", {"text": "x" * 2001}, w.T), 400, "VALIDATION_ERROR")
    r.expect("teacher to a parent of another class", http("POST", f"/conversations/{tam}/messages", {"text": "x"}, w.T), 403, "FORBIDDEN")
    r.expect("parent to another class's teacher", http("POST", f"/conversations/{mai}/messages", {"text": "x"}, w.P3), 403, "FORBIDDEN")
    r.expect("parent reading another family's conversation", http("GET", f"/conversations/{huong}/messages", token=w.P2), 403, "FORBIDDEN")
    r.expect("parent to parent", http("POST", f"/conversations/{tuan}/messages", {"text": "x"}, w.P), 403, "FORBIDDEN")
    r.expect("malformed peer id", http("GET", "/conversations/abc/messages", token=w.T), 403, "FORBIDDEN")
    r.expect("admins have no conversations", http("GET", "/conversations", token=w.A), 403, "FORBIDDEN")


def group_settings(r, w, env):
    r.start("settings", "Platform settings")
    current = http("GET", "/settings", token=w.T)
    r.check("defaults", current.json == {"platformName": "KinderLog", "supportEmail": "hotro@kinderlog.vn", "sessionTimeout": 60, "passwordMin": 6,
                                         "aiJournal": True, "sttLanguage": "Vietnamese", "maxPhotos": 6}, current)
    public = http("GET", "/settings/public")
    r.check("public part needs no sign-in and hides the rest", public.json == {"platformName": "KinderLog", "passwordMin": 6}, public)
    r.expect("full settings need sign-in", http("GET", "/settings"), 401, "UNAUTHENTICATED")
    wanted = {**current.json, "passwordMin": 8, "aiJournal": False} if current.json else {}
    r.expect("teacher cannot change settings", http("PUT", "/settings", wanted, w.T), 403, "FORBIDDEN")
    invalid = http("PUT", "/settings", {**wanted, "sessionTimeout": 1, "maxPhotos": 0, "supportEmail": "x"}, w.A)
    r.check("invalid values are named", invalid.status == 400 and set(invalid.fields) == {"sessionTimeout", "maxPhotos", "supportEmail"}, invalid)
    changed = http("PUT", "/settings", wanted, w.A)
    r.check("admin changes settings", changed.status == 200 and changed["aiJournal"] is False and changed["passwordMin"] == 8, changed)
    r.expect("AI off blocks voice drafts", http("POST", "/journals/voice-draft", {"transcript": "x"}, w.T), 403, "AI_DISABLED")
    r.expect("AI off blocks voice journals", http("POST", "/journals", {"date": day(-3), "source": "voice"}, w.T), 403, "AI_DISABLED")
    r.expect("AI off still allows manual journals", http("POST", "/journals", {"date": day(-3)}, w.T), 201)


def group_account(r, w, env):
    r.start("account", "Profile, passwords, tokens, locked accounts")
    mai_profile = {"name": "Mai", "phone": "0903000001", "email": "mai@kinderstars.edu.vn"}
    r.expect("phone of someone else", http("PATCH", "/me", {**mai_profile, "phone": "0903000002"}, w.T), 409, "PHONE_TAKEN")
    r.expect("email of someone else, any letter case", http("PATCH", "/me", {**mai_profile, "email": "HUONG@gmail.com"}, w.T), 409, "EMAIL_TAKEN")
    r.expect("invalid phone", http("PATCH", "/me", {**mai_profile, "phone": "123"}, w.T), 400, "VALIDATION_ERROR")
    r.expect("missing name", http("PATCH", "/me", {"phone": "0903000001", "email": "a@b.vn"}, w.T), 400, "VALIDATION_ERROR")
    updated = http("PATCH", "/me", {"name": " Cô Mai ", "phone": "0903000009", "email": "mai.new@kinderstars.edu.vn"}, w.T)
    r.check("update my profile", updated.status == 200 and updated["name"] == "Cô Mai" and updated["phone"] == "0903000009"
            and updated["email"] == "mai.new@kinderstars.edu.vn" and updated["class"]["name"] == "Mặt Trời 1", updated)
    r.check("role cannot be changed through the profile", http("PATCH", "/me", {"name": "Cô Mai", "phone": "0903000009", "email": "mai.new@kinderstars.edu.vn",
                                                                                 "role": "ADMIN", "isActive": True}, w.T).get("role") == "teacher")

    change = lambda current, new: http("PUT", "/me/password", {"currentPassword": current, "newPassword": new}, w.T)
    wrong = change("wrong", "new-password")
    r.check("wrong current password", wrong.status == 400 and wrong.fields.get("currentPassword") == "Current password is incorrect.", wrong)
    short = change("123456", "1234567")
    r.check("new password shorter than the setting", short.status == 400 and short.fields.get("newPassword") == "Password must be at least 8 characters.", short)
    same = change("123456", "123456")
    r.check("same password is refused", same.status == 400 and "newPassword" in same.fields, same)
    r.expect("change my password", change("123456", "new-password"), 204)
    r.expect("other sessions are ended", http("POST", "/auth/refresh", {"refreshToken": w.mai_session["refreshToken"]}), 401, "UNAUTHENTICATED")
    r.expect("old password no longer works", http("POST", "/auth/login", {"phone": "0903000009", "password": "123456"}), 401, "INVALID_CREDENTIALS")
    session = http("POST", "/auth/login", {"phone": "0903000009", "password": "new-password"})
    r.expect("new password works", session, 200)

    rotated = http("POST", "/auth/refresh", {"refreshToken": session.get("refreshToken")})
    r.check("refresh returns a new pair", rotated.status == 200 and rotated["accessToken"] and rotated["refreshToken"] != session.get("refreshToken") and rotated["expiresIn"] == 3600, rotated)
    r.expect("a used refresh token is refused", http("POST", "/auth/refresh", {"refreshToken": session.get("refreshToken")}), 401, "UNAUTHENTICATED")
    r.expect("new access token works", http("GET", "/me", token=rotated.get("accessToken")), 200)
    r.expect("unknown refresh token", http("POST", "/auth/refresh", {"refreshToken": "abc"}), 401, "UNAUTHENTICATED")
    r.expect("refresh token as an object", http("POST", "/auth/refresh", {"refreshToken": {"$ne": None}}), 400, "VALIDATION_ERROR")
    r.expect("sign out", http("POST", "/auth/logout", {"refreshToken": rotated.get("refreshToken")}, rotated.get("accessToken")), 204)
    r.expect("signed-out refresh token is ended", http("POST", "/auth/refresh", {"refreshToken": rotated.get("refreshToken")}), 401, "UNAUTHENTICATED")

    r.expect("forgot password: unknown email", http("POST", "/auth/forgot-password", {"email": "nobody@x.vn"}), 404, "EMAIL_NOT_FOUND")
    r.expect("forgot password: invalid email", http("POST", "/auth/forgot-password", {"email": "abc"}), 400, "VALIDATION_ERROR")
    sent = http("POST", "/auth/forgot-password", {"email": "Huong@Gmail.com"})
    r.check("forgot password: sent, any letter case", sent.json == {"sent": True}, sent)
    match = re.search(r"reset-password\?token=([0-9a-f]+)", env.log())
    token = match.group(1) if match else ""
    r.check("reset link is written to the server log", bool(token), env.log()[-300:])
    reset = lambda t, password: http("POST", "/auth/reset-password", {"token": t, "newPassword": password})
    r.expect("reset: wrong token", reset("abc", "huong-new-pass"), 400, "RESET_TOKEN_INVALID")
    r.expect("reset: password too short", reset(token, "123"), 400, "VALIDATION_ERROR")
    r.expect("reset: new password is set", reset(token, "huong-new-pass"), 204)
    r.expect("reset: a link works once", reset(token, "another-pass-1"), 400, "RESET_TOKEN_INVALID")
    r.expect("sign in with the reset password", http("POST", "/auth/login", {"phone": "0904000001", "password": "huong-new-pass"}), 200)

    http("PATCH", f"/admin/users/{w.ha['id']}", {"isLocked": True}, w.A)
    r.expect("locked: the open session stops at once", http("GET", "/me", token=w.T2), 401, "UNAUTHENTICATED")
    locked = http("POST", "/auth/login", {"phone": "0903000002", "password": "123456"})
    r.check("locked: sign-in is refused with the reason", locked.status == 403 and locked.code == "ACCOUNT_LOCKED"
            and locked["error"]["message"] == "This account is locked. Please contact your school.", locked)
    http("PATCH", f"/admin/users/{w.tuan['id']}", {"isActive": False}, w.A)
    r.expect("inactive: sign-in is refused", http("POST", "/auth/login", {"phone": "0904000002", "password": "123456"}), 403, "ACCOUNT_INACTIVE")
    r.expect("inactive: the open session stops at once", http("GET", "/notifications", token=w.P2), 401, "UNAUTHENTICATED")
    peers = [c["peerId"] for c in http("GET", "/conversations", token=rotated.get("accessToken")).get("items") or []]
    r.check("an inactive parent leaves the teacher's conversations", peers == [w.huong["id"]], peers)


def group_admin(r, w, env):
    r.start("admin", "Record-level endpoints under /admin")
    r.expect("teachers are refused", http("GET", "/admin/students", token=w.T), 403, "FORBIDDEN")
    r.expect("parents are refused", http("GET", "/admin/users", token=w.P), 403, "FORBIDDEN")
    r.expect("no token", http("GET", "/admin/users"), 401, "UNAUTHENTICATED")
    r.expect("record paths outside /admin do not exist", http("GET", "/students", token=w.A), 404, "NOT_FOUND")

    for route in ["users", "schools", "classes", "students", "parent-student-maps", "attendance", "class-daily-summaries",
                  "daily-journals", "journal-photos", "feedbacks", "notifications", "ai-processing-logs", "audit-logs"]:
        page = http("GET", f"/admin/{route}?size=1", token=w.A)
        r.check(f"list {route}", page.status == 200 and isinstance(page.get("items"), list) and page.get("page") == 1 and page.get("size") == 1
                and isinstance(page.get("total"), int) and len(page["items"]) <= 1, page)

    users = http("GET", "/admin/users?size=100", token=w.A)
    r.check("user records never include the password hash", users.status == 200 and "passwordHash" not in users.raw.decode() and "scrypt" not in users.raw.decode(), users)
    made = http("POST", "/admin/schools", {"schoolCode": "KS", "schoolName": "Mầm non Kinder Stars"}, w.A)
    sid = made.get("id")
    r.check("create a record", made.status == 201 and made["isActive"] is True and made["address"] is None, made)
    r.expect("duplicate unique value", http("POST", "/admin/schools", {"schoolCode": "KS", "schoolName": "x"}, w.A), 409, "CONFLICT")
    missing = http("POST", "/admin/schools", {"schoolCode": "K2"}, w.A)
    r.check("missing required field is named", missing.status == 400 and "schoolName" in missing.fields, missing)
    patched = http("PATCH", f"/admin/schools/{sid}", {"address": "25 Nguyễn Văn Linh"}, w.A)
    r.check("update changes only what was sent", patched.status == 200 and patched["address"] == "25 Nguyễn Văn Linh" and patched["schoolName"] == "Mầm non Kinder Stars", patched)
    r.expect("get one", http("GET", f"/admin/schools/{sid}", token=w.A), 200)
    r.expect("delete", http("DELETE", f"/admin/schools/{sid}", token=w.A), 204)
    r.expect("deleted record is gone", http("GET", f"/admin/schools/{sid}", token=w.A), 404, "NOT_FOUND")
    r.expect("malformed id", http("GET", "/admin/schools/abc", token=w.A), 404, "NOT_FOUND")

    filtered = http("GET", f"/admin/students?classId={w.c1['id']}&isActive=true", token=w.A)
    r.check("filter by fields", filtered.status == 200 and filtered["total"] == 3, filtered)
    r.expect("filter with a malformed id", http("GET", "/admin/students?classId=abc", token=w.A), 400, "VALIDATION_ERROR")
    r.check("unknown filters and repeated keys are ignored", http("GET", "/admin/students?foo=1&gender=Male&gender=Female", token=w.A).get("total") == 5)
    r.expect("invalid enum value", http("POST", "/admin/users", {"username": "x1", "password": "123456", "fullName": "x", "role": "PRINCIPAL"}, w.A), 400, "VALIDATION_ERROR")
    r.expect("password shorter than 6", http("POST", "/admin/users", {"username": "x2", "password": "123", "fullName": "x", "role": "TEACHER"}, w.A), 400, "VALIDATION_ERROR")
    r.expect("duplicate phone number", http("POST", "/admin/users", {"username": "x3", "password": "123456", "fullName": "x", "role": "TEACHER", "phoneNumber": "0904000001"}, w.A), 409, "CONFLICT")
    two = [http("POST", "/admin/users", {"username": f"nophone{i}", "password": "123456", "fullName": "x", "role": "PARENT", "email": "", "phoneNumber": None}, w.A).status for i in (1, 2)]
    r.check("several users may have no phone and no email", two == [201, 201], two)
    hashed = http("POST", "/admin/users", {"username": "x4", "password": "123456", "fullName": "x", "role": "PARENT", "passwordHash": "injected", "lastLoginAt": "2020-01-01"}, w.A)
    r.check("server-controlled fields in the body are ignored", hashed.status == 201 and hashed["lastLoginAt"] is None
            and http("POST", "/auth/login", {"username": "x4", "password": "123456"}).status == 200, hashed)
    r.expect("photo without a journal or a summary", http("POST", "/admin/journal-photos", {"classId": w.c1["id"], "photoUrl": "https://x/y.jpg"}, w.A), 400, "VALIDATION_ERROR")

    failed = http("GET", "/admin/audit-logs?status=Failed", token=w.A)
    r.check("blocked sign-ins are logged as failed", failed.get("total") == 2 and all(a["action"] == "Login" and a["entityName"] == "Authentication" for a in failed["items"]), failed)
    described = [a["description"] for a in http("GET", "/admin/audit-logs?size=100", token=w.A).get("items") or []]
    wanted = ["Attendance saved: Mặt Trời 1", "Journal published: Mặt Trời 1", "Profile information updated", "Password changed", "Password reset", "Global settings updated"]
    r.check("main actions are in the audit log", all(d in described for d in wanted), [d for d in wanted if d not in described])
    summaries = http("GET", "/admin/class-daily-summaries", token=w.A)
    r.check("class journals are visible to the admin", summaries.get("total") == 4, summaries)


def group_swagger(r, w, env):
    r.start("swagger", "Swagger page and description")
    page = http("GET", f"{BASE}/api/docs/")
    r.check("Swagger page is served", page.status == 200 and b"swagger-ui" in page.raw, page)
    spec = http("GET", f"{BASE}/api/docs.json").json or {}
    paths = spec.get("paths", {})
    operations = [(method.upper(), path, op) for path, item in paths.items() for method, op in item.items()]
    r.check("description is OpenAPI 3 with paths", str(spec.get("openapi", "")).startswith("3.") and len(operations) > 90, {"operations": len(operations)})

    schemas = spec.get("components", {}).get("schemas", {})
    refs = set(re.findall(r'"\$ref": "#/components/schemas/([^"]+)"', json.dumps(spec)))
    r.check("every schema reference resolves", refs <= set(schemas), sorted(refs - set(schemas)))
    r.check("every operation has a summary, a tag and responses", all(op.get("summary") and op.get("tags") and op.get("responses") for _m, _p, op in operations),
            [f"{m} {p}" for m, p, op in operations if not (op.get("summary") and op.get("tags") and op.get("responses"))])

    # Every documented operation must exist on the server: called without a token, a real
    # route answers 401 (or 200/400 when it is open), never "this route does not exist".
    fake = "64b000000000000000000000"
    missing, wrong_guard = [], []
    for method, path, op in operations:
        response = http(method, re.sub(r"\{\w+\}", fake, path), {} if method in ("POST", "PUT", "PATCH") else None)
        is_open = op.get("security") == []
        if response.status == 404 and response.code == "NOT_FOUND" and "does not exist" in (response.json or {}).get("error", {}).get("message", ""):
            missing.append(f"{method} {path}")
        elif (response.status == 401) == is_open:
            wrong_guard.append(f"{method} {path} -> {response.status}")
    r.check("every documented operation exists on the server", not missing, missing)
    r.check("documented sign-in requirement matches the server", not wrong_guard, wrong_guard)

    # And the other way round: the routes this script uses must all be documented.
    documented = {(m, re.sub(r"\{\w+\}", "{}", p)) for m, p, _op in operations}
    used = [("GET", "/teacher/class"), ("GET", "/teacher/dashboard"), ("GET", "/attendance"), ("PUT", "/attendance"), ("GET", "/journals"),
            ("POST", "/journals"), ("POST", "/journals/voice-draft"), ("GET", "/journals/{}"), ("PUT", "/journals/{}"), ("POST", "/journals/{}/approve"),
            ("POST", "/journals/{}/publish"), ("POST", "/journals/{}/recordings"), ("POST", "/uploads"), ("GET", "/conversations"),
            ("GET", "/conversations/unread-count"), ("GET", "/conversations/{}/messages"), ("POST", "/conversations/{}/messages"),
            ("POST", "/conversations/{}/read"), ("GET", "/notifications"), ("GET", "/notifications/unread-count"), ("POST", "/notifications/read"),
            ("POST", "/auth/login"), ("POST", "/auth/refresh"), ("POST", "/auth/logout"), ("POST", "/auth/forgot-password"), ("POST", "/auth/reset-password"),
            ("GET", "/me"), ("PATCH", "/me"), ("PUT", "/me/password"), ("GET", "/settings"), ("PUT", "/settings"), ("GET", "/settings/public"), ("GET", "/health")]
    r.check("every teacher, account and messaging route is documented", all(u in documented for u in used), [u for u in used if u not in documented])
    admin_routes = {p.split("/")[2] for _m, p, _op in operations if p.startswith("/admin/")}
    r.check("all 13 admin collections are documented", len(admin_routes) == 13, sorted(admin_routes))

    # A response must only contain fields its schema declares.
    def undeclared(schema_name, value):
        declared = set(schemas.get(schema_name, {}).get("properties", {}))
        return sorted(set(value) - declared) if isinstance(value, dict) else ["<not an object>"]

    samples = {
        "Account": http("GET", "/me", token=w.A).json,
        "ClassRoster": http("GET", "/teacher/class", token=w.T).json,
        "TeacherDashboard": http("GET", "/teacher/dashboard", token=w.T).json,
        "AttendanceSheet": http("GET", f"/attendance?date={TODAY}", token=w.T).json,
        "Journal": http("GET", f"/journals/{w.journal_id}", token=w.T).json,
        "Settings": http("GET", "/settings", token=w.A).json,
        "StudentRecord": (http("GET", "/admin/students?size=1", token=w.A).get("items") or [None])[0],
        "UserRecord": (http("GET", "/admin/users?size=1", token=w.A).get("items") or [None])[0],
    }
    extra = {name: undeclared(name, value) for name, value in samples.items()}
    r.check("responses contain only documented fields", not any(extra.values()), {k: v for k, v in extra.items() if v})


GROUPS = [
    ("system", group_system), ("auth", group_auth), ("roster", group_roster), ("attendance", group_attendance),
    ("uploads", group_uploads), ("voice", group_voice), ("journal", group_journal), ("inbox", group_inbox),
    ("chat", group_chat), ("settings", group_settings), ("account", group_account), ("admin", group_admin),
    ("swagger", group_swagger),
]

# What a group needs to have run before it.
REQUIRES = {
    "journal": ["attendance", "uploads", "voice"], "inbox": ["journal"], "chat": ["journal"],
    "account": ["chat", "settings"], "admin": ["journal", "account"], "swagger": ["journal"],
}


def selected_groups(only):
    if not only:
        return [name for name, _fn in GROUPS]
    wanted = {name for name, _fn in GROUPS if any(word in name for word in only)}
    if not wanted:
        raise SystemExit(f"No group matches {only}. Groups: {', '.join(name for name, _fn in GROUPS)}")
    pending = list(wanted)
    while pending:
        for needed in REQUIRES.get(pending.pop(), []):
            if needed not in wanted:
                wanted.add(needed)
                pending.append(needed)
    return [name for name, _fn in GROUPS if name in wanted]


def main():
    parser = argparse.ArgumentParser(description="Debug the whole KinderLog backend against a throwaway database.")
    parser.add_argument("-v", "--verbose", action="store_true", help="print passing checks too")
    parser.add_argument("--only", nargs="+", metavar="GROUP", help="run only the groups whose name contains one of these words")
    parser.add_argument("--keep", action="store_true", help="keep the debug database, uploads and server log afterwards")
    args = parser.parse_args()

    names = selected_groups(args.only)
    report = Report(args.verbose)
    env = Environment()
    crashed = None
    started = time.time()
    print(f"Preparing a throwaway environment (database {DB_NAME}, port {PORT})")
    try:
        env.start()
        step("Creating test accounts, classes and children")
        world = World()
        world.build()
        for name, run in GROUPS:
            if name not in names:
                continue
            try:
                run(report, world, env)
            except Exception as error:  # a crash inside a group is a finding, not a reason to skip the rest
                report.check(f"group ran to the end ({type(error).__name__}: {error})", False, str(error))
        errors = [line for line in env.log().splitlines() if line.strip() and not line.startswith("[mail]") and "listening on" not in line]
        report.start("server log", "Unexpected output of the server")
        report.check("the server logged no errors", not errors, errors[:20])
    except Exception as error:
        crashed = error
    finally:
        env.stop(args.keep)

    if crashed:
        print(f"\nCould not finish: {crashed}")
        return 2
    ok = report.summary()
    print(f"  {time.time() - started:.0f} seconds")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
