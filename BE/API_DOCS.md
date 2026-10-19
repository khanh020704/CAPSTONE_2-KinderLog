# KinderLog Backend API

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Microsoft SQL Server 2022 (Docker)
- **Auth**: JWT (JSON Web Token)
- **Password Hashing**: bcryptjs

---

## Base URL
```
http://localhost:5000/api
```

---

## Authentication

All protected routes require:
```
Authorization: Bearer <token>
```

---

## 1. Auth Routes (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | ❌ | Login (any role) |
| GET | `/api/auth/me` | ✅ | Get current user |
| PUT | `/api/auth/change-password` | ✅ | Change password |

### Login
```json
POST /api/auth/login
{
  "role": "admin | principal | teacher | parent",
  "phone": "0901000001",
  "password": "123456"
}
```
**Response:**
```json
{
  "token": "eyJ...",
  "role": "admin",
  "user": { "Id": "a1", "Name": "Lê Quang Huy", ... }
}
```

---

## 2. Admin Routes (`/api/admin`) Role: admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/dashboard` | Platform stats and recent activity |
| GET | `/api/admin/schools` | List all schools |
| POST | `/api/admin/schools` | Create a school |
| PUT | `/api/admin/schools/:id` | Update a school |
| PATCH | `/api/admin/schools/:id/status` | Change school status |
| GET | `/api/admin/principals` | List all principals |
| POST | `/api/admin/principals` | Create a principal |
| PUT | `/api/admin/principals/:id` | Update a principal |
| PATCH | `/api/admin/principals/:id/status` | Change principal status |
| POST | `/api/admin/principals/:id/reset-password` | Reset to 123456 |
| GET | `/api/admin/settings` | Get system settings |
| PUT | `/api/admin/settings` | Update system settings |
| GET | `/api/admin/audit?limit=50&offset=0` | Audit logs (paginated) |
| GET | `/api/admin/monitoring` | System monitoring metrics |
| GET | `/api/admin/profile` | Admin own profile |
| PUT | `/api/admin/profile` | Update admin profile |

---

## 3. Parent Routes (`/api/parent`) Role: parent

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/parent/profile` | Get parent profile |
| PUT | `/api/parent/profile` | Update profile |
| GET | `/api/parent/children` | List linked children with class and teacher |
| GET | `/api/parent/children/:id/attendance?date=YYYY-MM-DD` | Child attendance |
| GET | `/api/parent/children/:id/journals?date=YYYY-MM-DD` | Published journals |
| GET | `/api/parent/messages` | Conversations list and latest messages |
| GET | `/api/parent/messages?teacherId=t1` | Full conversation with teacher |
| POST | `/api/parent/messages` | Send a message to teacher |
| GET | `/api/parent/notifications` | All parent notifications |
| PUT | `/api/parent/notifications/:id/read` | Mark one as read |
| PUT | `/api/parent/notifications/read-all` | Mark all as read |
| GET | `/api/parent/announcements` | Published school announcements |
| GET | `/api/parent/cameras?classId=c1` | Camera info and schedule |

---

## Default Test Accounts (password: 123456)

| Role | Phone | Name |
|------|-------|------|
| Admin | 0901000001 | Le Quang Huy |
| Principal | 0902000001 | Tran Thi Lan |
| Teacher | 0903000001 | Nguyen Thi Mai |
| Parent | 0904000001 | Nguyen Thi Huong |

---

## Quick Start

```bash
# 1. Start SQL Server via Docker
docker compose up -d

# 2. Wait 60 seconds for SQL Server to be ready, then run migration
cd BE
npm run migrate

# 3. Seed demo data
npm run seed

# 4. Start backend server
npm run dev

# 5. Start frontend (separate terminal)
cd ../FE
npm run dev
```
