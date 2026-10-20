"""Test Voice-to-JSON end to end with the real AI and Whisper (Scope 6.2).

Unlike debug_api.py, this calls the configured AI provider (GROQ_API_KEY in BE/.env), so it
spends API quota and its wording varies between runs. The checks are therefore about what
must hold every time: which child a statement reaches, what is held for the teacher, what
is flagged, and that nothing about a child leaks into the part every parent sees.

It uses the same throwaway environment as debug_api.py (database "kinderlog_debug"), with
the AI engine and server speech-to-text switched on. Recordings come from
Debug/voice_samples (see make_voice_samples.py).

Usage:
    python Debug/test_voice_ai.py           run every scenario
    python Debug/test_voice_ai.py -v        print every passing check and each draft
    python Debug/test_voice_ai.py --keep    keep the debug database and server log
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_api import ADMIN_PASSWORD, DB_NAME, PORT, Environment, File, Report, day, http, step  # noqa: E402

SAMPLES = Path(__file__).resolve().parent / "voice_samples"
PAUSE = 12  # seconds between AI calls: the free Groq tier allows about 8,000 tokens a minute

CLASS = ["Nguyễn Minh An", "Trần Bảo Ngọc", "Lê Gia Huy", "Phạm Khánh Linh", "Hoàng Đức Minh", "Vũ Ngọc Diệp", "Đỗ Gia Hưng"]


class AiEnvironment(Environment):
    def __init__(self):
        super().__init__()
        self.env.update({"JOURNAL_DRAFT_ENGINE": "ai", "SPEECH_TO_TEXT": "on"})

    def start(self):
        configured = self.node("--input-type=module", "-e", "import { journalAiProvider } from './src/config/ai.js'; console.log(journalAiProvider() || '')").stdout.strip()
        if configured != "groq":
            raise RuntimeError("This test needs GROQ_API_KEY in BE/.env (it uses Groq for both the AI and Whisper).")
        super().start()


def build_class():
    admin = http("POST", "/auth/login", {"username": "admin", "password": ADMIN_PASSWORD})["accessToken"]

    def make(path, **body):
        response = http("POST", f"/admin/{path}", body, admin)
        if response.status != 201:
            raise RuntimeError(f"{path}: {response.brief()}")
        return response.json

    teacher = make("users", username="mai", password="123456", fullName="Nguyễn Thị Mai", role="TEACHER", phoneNumber="0903000001")
    cls = make("classes", classCode="MT1", className="Mặt Trời 1", gradeLevel="Mầm", schoolYear="2026-2027", teacherId=teacher["id"])
    ids = {}
    for number, name in enumerate(CLASS, start=1):
        ids[name] = make("students", studentCode=f"S{number}", fullName=name, dateOfBirth="2022-03-14", gender="Male", classId=cls["id"])["id"]
    token = http("POST", "/auth/login", {"phone": "0903000001", "password": "123456"})["accessToken"]
    return token, ids


def summarise(draft, names):
    shown = {k: v for k, v in draft["sections"].items() if v}
    personal = {names.get(k, k): v for k, v in draft["personal"].items()}
    lines = [f"    source={draft['transcriptSource']} transcript: {draft['transcript']}",
             f"    class (every parent): {json.dumps(shown, ensure_ascii=False)}",
             f"    private notes: {json.dumps(personal, ensure_ascii=False)}"]
    for issue in draft["issues"]:
        lines.append(f"    {'HOLD ' if issue['held'] else 'CHECK'} {issue['type']:<26} heard={issue['spokenNames']} "
                     f"candidates={[names.get(c, c) for c in issue['candidates']]} | {issue['text']}")
    return "\n".join(lines)


def run(r, token, ids, verbose):
    names = {v: k for k, v in ids.items()}
    an, ngoc, huy, linh, minh, diep, hung = (ids[n] for n in CLASS)
    shared = lambda d: " ".join(v for v in d["sections"].values() if v)
    held = lambda d, kind=None: [i for i in d["issues"] if i["held"] and (kind is None or i["type"] == kind)]
    kinds = lambda d: {i["type"] for i in d["issues"]}
    calls = 0

    def draft(label, transcript=None, sample=None, **extra):
        nonlocal calls
        if calls:
            time.sleep(PAUSE)
        calls += 1
        if sample:
            response = http("POST", "/journals/voice-draft", token=token, form={"audio": File(f"{sample}.mp3", (SAMPLES / f"{sample}.mp3").read_bytes(), "audio/mpeg"), **extra})
        else:
            response = http("POST", "/journals/voice-draft", {"transcript": transcript, **extra}, token)
        r.start(label, ("recording " + sample) if sample else f'"{transcript}"')
        if not r.check("the server answered with a draft", response.status == 200, response):
            return None
        if verbose:
            print(summarise(response.json, names))
        return response.json

    # 1. A correct name.
    for label, args in [("correct name", {"transcript": "bé Khánh Linh hôm nay ngủ trưa rất ngon"}), ("correct name (voice)", {"sample": "correct_name"})]:
        d = draft(label, **args)
        if d:
            r.check("the statement reaches Phạm Khánh Linh only", list(d["personal"]) == [linh] and "ngủ" in d["personal"][linh], d["personal"])
            r.check("nothing is held", not held(d), d["issues"])
            r.check("nothing about her is shared with every parent", "Linh" not in shared(d), d["sections"])

    # 2. One wrong character in a full name.
    d = draft("misspelled full names", "bạn Trần Bảo Ngoc hôm nay ăn ít còn bé Phạm Khánh Lin tự xúc cơm")
    if d:
        r.check("neither statement is given to a child", ngoc not in d["personal"] and linh not in d["personal"], d["personal"])
        r.check("both are held, with the closest child suggested", {tuple(i["candidates"]) for i in held(d)} >= {(ngoc,), (linh,)}, d["issues"])
        r.check("the misspelled names are shown as heard", any("Ngoc" in " ".join(i["spokenNames"]) for i in held(d)), d["issues"])
        r.check("nothing is shared with every parent", "Ngoc" not in shared(d) and "Lin" not in shared(d), d["sections"])

    # 3. A name close to another child's.
    for label, args in [("name close to another child", {"transcript": "bé Hùng bị ho nhiều vào buổi chiều"}), ("name close to another child (voice)", {"sample": "near_name"})]:
        d = draft(label, **args)
        if d:
            heard = " ".join(n for i in d["issues"] for n in i["spokenNames"])
            if "Hưng" in heard or hung in d["personal"]:
                # Whisper may hear "Hưng" for "Hùng": then the name is exact and correctly reaches Hưng.
                r.check("Whisper heard Hưng: the statement reaches Đỗ Gia Hưng", list(d["personal"]) == [hung], d)
            else:
                r.check("not given to Hưng or Huy", hung not in d["personal"] and huy not in d["personal"], d["personal"])
                r.check("held with the likely child", any(set(i["candidates"]) <= {hung, huy} for i in held(d)), d["issues"])
                r.check("not shared with every parent", "Hùng" not in shared(d), d["sections"])
            r.check("the cough is flagged as health information to check", "health_alert" in kinds(d), d["issues"])

    # 4. Contradictions.
    d = draft("contradictions", "bé Huy ăn hết suất cơm buổi trưa sau đó bé Huy bỏ ăn hoàn toàn không bạn nào bị ốm bé Diệp bị sốt nhẹ")
    if d:
        contradictions = [i for i in d["issues"] if i["type"] == "contradiction"]
        r.check("Huy's meals are flagged as contradictory", any(huy in i["studentIds"] or "Huy" in i["text"] for i in contradictions), d["issues"])
        r.check("'no child unwell' against Diệp's fever is flagged", any(i["section"] == "health" or diep in i["studentIds"] for i in contradictions), d["issues"])
        note = d["personal"].get(huy, "")
        r.check("both statements about Huy are kept as said", "hết suất" in note and "bỏ ăn" in note, d["personal"])

    # 5. One child with problems in several sections.
    d = draft("one child, several sections (voice)", sample="one_child_many")
    if d:
        note = d["personal"].get(an, "").lower()
        covered = [word for word in ["ăn", "ngủ", "sốt", "khóc"] if word in note]
        r.check("all of it reaches Nguyễn Minh An", len(covered) >= 3, d["personal"])
        r.check("the fever is flagged as health information to check", "health_alert" in kinds(d), d["issues"])
        r.check("nothing about him is shared with every parent", "An " not in shared(d) + " " and "sốt" not in shared(d), d["sections"])

    # 6. No name given.
    d = draft("missing names", "có một bạn bị ngã trầy đầu gối cô đã sát trùng một bé bị nôn sau bữa trưa")
    if d:
        r.check("both incidents are held until the teacher says which child", len(held(d, "missing_student")) >= 1, d["issues"])
        r.check("neither incident is shared with every parent", "ngã" not in shared(d) and "nôn" not in shared(d), d["sections"])
        r.check("no child is guessed", d["personal"] == {}, d["personal"])

    # 7. The class first, then each child, and messages to the right parents.
    mixed = "hôm nay cả lớp ăn hết suất trừ bé Huy ăn ít các con ngủ trưa ngon buổi sáng cả lớp học vẽ nhắn mẹ bé Minh mai mang thêm quần áo cho con nhờ phụ huynh mai mang áo khoác cho các con"
    for label, args in [("class and children", {"transcript": mixed}), ("class and children (voice)", {"sample": "class_and_children"})]:
        d = draft(label, **args)
        if d:
            s = d["sections"]
            r.check("the class meal, nap and lesson are shared", "hết suất" in s["meal"] and "ngủ" in s["sleep"] and "vẽ" in s["learning"], s)
            r.check("the request to every parent is a Special Note", "áo khoác" in s["note"], s)
            r.check("no child is named in the shared part", "Huy" not in shared(d) and "Minh" not in shared(d), s)
            r.check("Huy's meal is his private note", "ít" in d["personal"].get(huy, ""), d["personal"])
            r.check("the message for Minh's mother reaches Minh's parents only", "quần áo" in d["personal"].get(minh, ""), d["personal"])
            r.check("nothing is held", not held(d), d["issues"])

    # 8. A message to a parent with a wrong child's name.
    d = draft("message with a wrong name", "nhắn mẹ bé Diệp Anh mai mang thêm bỉm cho con")
    if d:
        r.check("not given to Vũ Ngọc Diệp or anyone else", d["personal"] == {}, d["personal"])
        r.check("held for the teacher", len(held(d)) >= 1, d["issues"])
        r.check("not shared with every parent", "bỉm" not in shared(d), d["sections"])

    # 9. Whole flow: a draft with a held point cannot be approved until the teacher decides.
    d = draft("save, confirm, approve", "cả lớp ăn ngon bé Hùng hơi mệt")
    if d:
        created = http("POST", "/journals", {"date": day(0), "source": "voice", "sections": d["sections"], "personal": d["personal"],
                                             "transcript": d["transcript"], "issues": d["issues"]}, token)
        jid = created.get("id")
        r.check("the journal is saved with its open points", created.status == 201 and any(i["status"] == "open" for i in created["issues"]), created)
        r.expect("approving is refused while points are open", http("POST", f"/journals/{jid}/approve", token=token), 422, "REVIEW_PENDING")
        decisions, personal = [], dict(created["personal"])
        for issue in created["issues"]:
            if issue["held"]:
                personal[hung] = (personal.get(hung, "") + " " + issue["text"]).strip()
                decisions.append({"id": issue["id"], "status": "resolved", "resolution": "assigned", "assignedTo": [hung]})
            else:
                decisions.append({"id": issue["id"], "status": "resolved", "resolution": "confirmed"})
        saved = http("PUT", f"/journals/{jid}", {"sections": created["sections"], "personal": personal, "photos": [], "issues": decisions}, token)
        r.check("the teacher's decisions are saved", saved.status == 200 and all(i["status"] == "resolved" for i in saved["issues"]), saved)
        r.expect("approving works once everything is decided", http("POST", f"/journals/{jid}/approve", token=token), 200)
        r.expect("and the journal can be published", http("POST", f"/journals/{jid}/publish", token=token), 200)


def main():
    parser = argparse.ArgumentParser(description="Test Voice-to-JSON with the real AI and Whisper.")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()

    report = Report(args.verbose)
    env = AiEnvironment()
    crashed = None
    print(f"Preparing a throwaway environment (database {DB_NAME}, port {PORT}, AI and Whisper on)")
    try:
        env.start()
        step("Creating a class of seven children")
        token, ids = build_class()
        run(report, token, ids, args.verbose)
        errors = [line for line in env.log().splitlines() if line.strip() and "listening on" not in line and not line.startswith("[mail]")]
        report.start("server log", "Unexpected output of the server")
        report.check("the server logged no errors", not errors, errors[:20])
    except Exception as error:
        crashed = error
    finally:
        env.stop(args.keep)
    if crashed:
        print(f"\nCould not finish: {crashed}")
        return 2
    return 0 if report.summary() else 1


if __name__ == "__main__":
    sys.exit(main())
