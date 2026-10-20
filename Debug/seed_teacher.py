"""Create a ready-to-use Teacher account (with a class, students and parents) in the real database.

It talks to the running backend, so start it first (`npm run dev` in BE). Running the
script again changes nothing: every record is looked up before it is created.

The phone numbers and password match the "Demo account" hint on the frontend login page,
so the "Fill in" button there signs you in.

Usage:
    python Debug/seed_teacher.py
    python Debug/seed_teacher.py --api http://localhost:3000/api/v1 --admin-password <password>
"""

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BE = Path(__file__).resolve().parent.parent / "BE"

ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "Admin@2026"
PASSWORD = "123456"  # the password the frontend's demo hint shows for every role

TEACHER = {"username": "teacher.mai", "fullName": "Nguyễn Thị Mai", "phoneNumber": "0903000001", "email": "mai.nguyen@kinderstars.edu.vn"}
CLASS = {"classCode": "MT1", "className": "Mặt Trời 1", "gradeLevel": "Mầm", "schoolYear": "2026-2027", "roomName": "P.101"}

# (student, date of birth, gender, parent, relationship) - the first rows of the frontend's demo class
FAMILIES = [
    ("Nguyễn Minh An", "2022-03-14", "Male", "Nguyễn Thị Hương", "Mẹ"),
    ("Trần Bảo Ngọc", "2022-01-22", "Female", "Trần Văn Dũng", "Cha"),
    ("Lê Gia Huy", "2021-11-05", "Male", "Phạm Thị Thu", "Mẹ"),
    ("Phạm Khánh Linh", "2022-05-30", "Female", "Phạm Quốc Tuấn", "Cha"),
    ("Hoàng Đức Minh", "2021-12-18", "Male", "Vũ Thị Hạnh", "Mẹ"),
    ("Vũ Ngọc Diệp", "2022-02-09", "Female", "Vũ Minh Khôi", "Cha"),
]

for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8", errors="replace")


class Api:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = None

    def call(self, method, path, body=None):
        headers = {"Content-Type": "application/json"} if body is not None else {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raw = error.read()
            return error.code, json.loads(raw) if raw else None

    def ensure(self, path, match, body):
        """Returns the record matching `match`, creating it from `body` when there is none."""
        status, found = self.call("GET", f"/admin/{path}?{urllib.parse.urlencode(match)}")
        if status != 200:
            raise SystemExit(f"Could not read {path}: {found}")
        if found["items"]:
            return found["items"][0], False
        status, created = self.call("POST", f"/admin/{path}", body)
        if status != 201:
            raise SystemExit(f"Could not create {path} {body}: {created}")
        return created, True


def sign_in_admin(api, password):
    status, session = api.call("POST", "/auth/login", {"username": ADMIN_USERNAME, "password": password})
    if status == 200:
        return session["accessToken"], False

    # No such admin yet: create it with the backend's own script, then sign in.
    made = subprocess.run(
        ["node", "--env-file-if-exists=.env", "scripts/create-admin.js", ADMIN_USERNAME, password, "Quản trị hệ thống"],
        cwd=BE, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if made.returncode != 0:
        raise SystemExit(
            f'Could not sign in as "{ADMIN_USERNAME}" and could not create it: {(made.stdout + made.stderr).strip()}\n'
            "If the admin already exists with another password, pass it with --admin-password."
        )
    status, session = api.call("POST", "/auth/login", {"username": ADMIN_USERNAME, "password": password})
    if status != 200:
        raise SystemExit(f"The admin was created but could not sign in: {session}")
    return session["accessToken"], True


def main():
    parser = argparse.ArgumentParser(description="Create a ready-to-use Teacher account in the real database.")
    parser.add_argument("--api", default="http://localhost:3000/api/v1", help="address of the running backend")
    parser.add_argument("--admin-password", default=DEFAULT_ADMIN_PASSWORD, help="password of the admin account (created if missing)")
    args = parser.parse_args()

    api = Api(args.api)
    try:
        status, health = api.call("GET", "/health")
    except OSError:
        raise SystemExit(f"The backend is not running at {args.api}. Start it with `npm run dev` in BE.")
    if status != 200:
        raise SystemExit(f"The backend is not healthy: {health}")

    api.token, admin_created = sign_in_admin(api, args.admin_password)
    new = lambda created: "created" if created else "already there"
    print(f"admin    {ADMIN_USERNAME} ({new(admin_created)})")

    teacher, created = api.ensure("users", {"phoneNumber": TEACHER["phoneNumber"]}, {**TEACHER, "password": PASSWORD, "role": "TEACHER"})
    print(f"teacher  {teacher['fullName']} ({new(created)})")
    if teacher["role"] != "TEACHER":
        raise SystemExit(f"{TEACHER['phoneNumber']} belongs to a {teacher['role']} account, not a teacher.")

    cls, created = api.ensure("classes", {"classCode": CLASS["classCode"], "schoolYear": CLASS["schoolYear"]}, {**CLASS, "teacherId": teacher["id"]})
    print(f"class    {cls['className']} ({new(created)})")
    if cls.get("teacherId") != teacher["id"]:
        status, cls = api.call("PATCH", f"/admin/classes/{cls['id']}", {"teacherId": teacher["id"]})
        print(f"         now led by {teacher['fullName']}")

    for number, (name, dob, gender, parent_name, relationship) in enumerate(FAMILIES, start=1):
        # The school's backup already uses HS001..., so the demo class has codes of its own.
        code = f"MT1-{number:02d}"
        student, s_new = api.ensure("students", {"studentCode": code},
                                    {"studentCode": code, "fullName": name, "dateOfBirth": dob, "gender": gender, "classId": cls["id"]})
        phone = f"09040000{number:02d}"
        parent, p_new = api.ensure("users", {"phoneNumber": phone},
                                   {"username": f"parent.{phone}", "fullName": parent_name, "phoneNumber": phone, "password": PASSWORD, "role": "PARENT"})
        _link, l_new = api.ensure("parent-student-maps", {"parentId": parent["id"], "studentId": student["id"]},
                                  {"parentId": parent["id"], "studentId": student["id"], "relationship": relationship, "isPrimary": True})
        print(f"student  {name:<18} {new(s_new):<14} parent {parent_name} {phone} ({new(p_new or l_new)})")

    # Proof that the account works end to end.
    status, session = api.call("POST", "/auth/login", {"phone": TEACHER["phoneNumber"], "password": PASSWORD, "role": "teacher"})
    if status != 200:
        raise SystemExit(f"\nThe teacher exists but could not sign in with the password {PASSWORD}: {session}")
    api.token = session["accessToken"]
    _status, roster = api.call("GET", "/teacher/class")

    print(f"\nTeacher sign-in works: {roster['class']['name']}, {len(roster['students'])} students.")
    print("\nSign in on the frontend (http://localhost:5173/login):")
    print(f"  Teacher  {TEACHER['phoneNumber']}  /  {PASSWORD}")
    print(f"  Parent   0904000001  /  {PASSWORD}   (mother of {FAMILIES[0][0]}; parents go up to 09040000{len(FAMILIES):02d})")
    print(f"  Admin    username {ADMIN_USERNAME}  /  {args.admin_password}   (API and Swagger only)")


if __name__ == "__main__":
    main()
