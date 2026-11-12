# KinderLog

KinderLog is a preschool daily journal and reporting system with multimodal AI integration, built for preschools, their teachers and the families they serve. Teachers record a child's day by speaking naturally in Vietnamese; AI turns the recording into a structured draft that the teacher reviews before anything reaches parents. Schools manage classes, staff and children in one place, and parents follow their child's day, message teachers and watch the classroom camera during permitted hours.


## 1. Project overview

In many preschools, a child's day is still reported on paper, in scattered chat groups or not at all. Teachers spend their evenings writing the same notes for every child, parents get little or inconsistent information, and school leaders have no reliable picture of attendance, health or communication across classes.

KinderLog addresses this by combining:

- a structured daily journal per class and per child,
- Vietnamese voice recording turned into a journal draft by AI,
- a review and publishing step so teachers stay in control,
- a parent portal with timeline, notifications, messaging and a classroom camera,
- and a dashboard and reports for the principal.

## 2. Project goals

- Cut the time teachers spend writing daily journals.
- Give parents a clear, timely view of their child's day.
- Keep AI output under human control: nothing is published without the teacher's approval.
- Keep every school's data separate and every child's data visible only to the people who should see it.
- Give principals up-to-date figures on attendance, health and journal status.

## 3. Main features

### School and account management

- Registered schools and their principal accounts (System Admin)
- School profile, academic years and semesters
- Classes, homeroom teachers, teacher accounts
- Children and parent profiles with parent–child links
- System parameters, attribute fields and an append-only audit log

### Daily journal

- Daily attendance: present, excused or unexcused absence
- Bulk status for the whole class (meals, nap, activities) with per-child exceptions
- Class sections, a private note per child and photos
- Review, approval and publishing; parents only ever see published journals

### AI-powered journaling

- Vietnamese voice recording transcribed with Whisper large-v3
- Transcript turned into structured journal fields by an LLM, validated against a schema
- Unclear names, contradictions and health remarks flagged for the teacher to confirm
- Manual entry always available as a fallback

### Parent experience

- Daily timeline of the child's published journal
- Notifications with read receipts
- Messaging with the class teachers
- Classroom camera, available only to parents of the class and only within the viewing window set by the school

### Reporting

- Principal dashboard (attendance, health, journal status), refreshed automatically
- Report export to PDF and Excel

## 4. Users

- **System Admin:** manages registered schools, principal accounts and platform settings.
- **Principal:** manages the school, academic years, classes, teachers, children, parents and cameras; follows the dashboard and exports reports.
- **Teacher:** takes attendance, writes the class journal by voice or by hand, reviews and publishes it, and answers parents.
- **Parent:** reads the child's journal, receives notifications, messages teachers and watches the classroom camera.

## 5. Technology stack

- **Frontend:** React 18, Vite 5, React Router 6
- **Backend:** NestJS 11 (TypeScript), TypeORM
- **Database:** Microsoft SQL Server 2022
- **Cache:** Redis 7
- **AI:** Groq API – Whisper large-v3 (speech-to-text), GPT-OSS 120B (voice-to-JSON)
- **Media storage:** ImageKit.io with signed URLs
- **Classroom camera:** PeerJS (WebRTC) with STUN/TURN
- **Tools:** GitHub, Docker, Swagger, Postman, Jest + Supertest, Playwright, Trello, Discord, Zalo

## 6. High-level architecture

KinderLog is a web system made of:

- a **React** single-page app with screens for System Admin, Principal, Teacher and Parent (desktop for staff, mobile-friendly for teachers and parents),
- a **NestJS** REST API that handles authentication (JWT), role and school-level access checks, journals, messaging, cameras and reports,
- **SQL Server** for relational data and **Redis** for dashboard caching and sign-in lockout,
- an **AI pipeline** (speech-to-text → LLM extraction → schema validation → teacher review), with a rule-based extractor when the AI service is unavailable,
- **ImageKit** for journal photos and recordings,
- and **PeerJS/WebRTC** for the classroom camera, streamed from a device in the classroom.

Every request is checked on the server against the user's role and school, so the multi-tenant isolation does not depend on the user interface.

## 7. Project scope

### In scope

- Multi-school platform with four roles
- Attendance, class and per-child daily journals, photos
- Vietnamese voice journaling with AI drafts and teacher review
- Parent timeline, notifications, messaging and classroom camera
- Principal dashboard and report export

### Out of scope

- Native mobile apps (the web app is mobile-friendly)
- Integration with real CCTV/IP camera systems (the camera is simulated by a device with a webcam)
- Automatic face recognition in photos
- Parent photo consent management
- Tuition, fees and other school administration

## 8. Development approach

The project uses Scrum with three sprints, incremental releases and testing at the end of every sprint.

- **Initiation and documentation** (20/08 – 02/09/2026)
- **Sprint 1** (03/09 – 30/09): authentication and security, attribute fields, schools and principals, system parameters, audit logs, school profile and academic years, classes, teacher accounts
- **Sprint 2** (01/10 – 28/10): children and parents, camera viewing windows, attendance, bulk status and exceptions, voice recording and AI processing, manual fallback, review and publishing, parent feedback
- **Sprint 3** (29/10 – 25/11): parent timeline, notifications and read receipts, classroom livestream, dashboard and reports, deployment

## 9. Team members

| # | Student ID | Full name | Role | Email |
|---|---|---|---|---|
| 1 | 28210203983 | Ho Ngoc Dang Khanh | Scrum Master | hndangkhanh0207@gmail.com |
| 2 | 28219106936 | Ho A Bao | Product Owner | hoabao1@gmail.com |
| 3 | 28211406961 | Le Nhat Anh | Developer | anhnhatle1904@gmail.com |
| 4 | 27211202824 | Vo Le Duy | Developer | duyvole9@gmail.com |

Mentor: **M.Sc. Nguyen Minh Nhat**

## 10. Project documents

- Product Backlog
- User Stories
- Project Plan
- Sprint Backlog
- Test Plan and Test Cases
- Code Standard

## 11. KinderLog highlights

- **Teachers stay in control:** AI only prepares a draft; nothing reaches parents without the teacher's approval.
- **Built for Vietnamese:** voice journaling understands natural Vietnamese speech and children's names, and flags the uncertain parts.
- **Privacy by design:** each school's data is isolated, parents see only their own child, and the camera opens only to the right parents at the right time.
- **Traceable:** important actions are written to an append-only audit log.

## 12. Future direction

- Native mobile apps with push notifications
- Integration with real classroom IP cameras
- Photo consent with in-app face blurring
- Richer analytics on children's development over time
- Offline journaling for unstable connections

## 13. Contact

For project information, collaboration or academic discussion, please contact the team members listed above.

## 14. Run locally

The repository holds the backend in `BE/` and the frontend in `FE/`; each folder has its own README with the full setup. You need **Node.js 20** and **Docker Desktop**.

```bash
git clone https://github.com/khanh020704/CAPSTONE_2-KinderLog.git
cd CAPSTONE_2-KinderLog
```

Backend (API on port 3000):

```bash
cd BE
cp .env.example .env      # edit JWT_SECRET, admin account, Groq API key
docker compose up -d      # SQL Server + Redis
npm install
npm run migration:run
npm run db:seed:admin
npm run start:dev
```

Frontend (Vite, port 5173), in another terminal:

```bash
cd FE
npm install
npm run dev
```

The frontend forwards `/api` to `http://localhost:3000` by default. API documentation (Swagger): http://localhost:3000/api/docs
