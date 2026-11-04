# KinderLog – Backend

API của hệ thống **KinderLog – Preschool Daily Journal & Reporting System with Multimodal AI Integration** (đồ án Capstone 2, nhóm C2SE.10).

Backend phục vụ 4 vai trò: **System Admin, Hiệu trưởng, Giáo viên, Phụ huynh**. Mỗi trường là một tenant riêng, dữ liệu giữa các trường được tách biệt hoàn toàn.

| Thành phần | Công nghệ |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| Database | Microsoft SQL Server 2022 + TypeORM (migration) |
| Cache | Redis 7 |
| Xác thực | JWT, bcrypt, phân quyền theo vai trò (RBAC) |
| AI | Groq API – Whisper large-v3 (giọng nói → chữ), GPT-OSS 120B (chữ → nhật ký có cấu trúc) |
| Lưu ảnh | Ổ đĩa local hoặc ImageKit.io (URL có chữ ký) |
| Tài liệu API | Swagger tại `/api/docs` |

---

## 1. Yêu cầu

- **Node.js 20** trở lên
- **Docker Desktop** (chạy SQL Server và Redis)
- Groq API key – *không bắt buộc*. Thiếu key, hệ thống tự dùng bộ quy tắc từ khoá để tạo nháp nhật ký.

> Trên Windows, nếu PowerShell báo *"running scripts is disabled"* thì dùng `npm.cmd` thay cho `npm`.

---

## 2. Cài đặt lần đầu

```bash
cd BE
cp .env.example .env            # Windows: copy .env.example .env
```

Mở file `.env` và điền tối thiểu:

| Biến | Ý nghĩa |
|---|---|
| `JWT_SECRET` | Chuỗi ngẫu nhiên dài, dùng để ký token đăng nhập |
| `ADMIN_PHONE`, `ADMIN_PASSWORD` | Tài khoản System Admin đầu tiên (mật khẩu ≥ 10 ký tự, có chữ và số) |
| `GROQ_API_KEY` | Key Groq (bắt đầu bằng `gsk_`), để trống nếu không dùng AI |

Các biến còn lại giữ mặc định là chạy được. Sau đó:

```bash
docker compose up -d            # SQL Server :1433 và Redis :6379 (lần đầu SQL Server cần ~20 giây)
npm install
npm run migration:run           # tạo database "kinderlog" và toàn bộ bảng
npm run db:seed:admin           # tạo tài khoản System Admin từ ADMIN_PHONE / ADMIN_PASSWORD
```

---

## 3. Chạy hằng ngày

```bash
cd BE
docker compose up -d
npm run start:dev
```

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs
- Kiểm tra nhanh: http://localhost:3000/health → `"db":"up"` là kết nối database ổn; mục `ai` cho biết đang dùng Groq hay bộ quy tắc từ khoá.

Bản chạy production: `npm run build` rồi `npm run start:prod`.

---

## 4. Các lệnh thường dùng

| Lệnh | Mục đích |
|---|---|
| `npm run start:dev` | Chạy dev, tự khởi động lại khi sửa code |
| `npm run migration:run` | Áp dụng migration mới (chạy sau mỗi lần `git pull`) |
| `npm run migration:generate` | Sinh migration từ thay đổi entity |
| `npm run migration:revert` | Hoàn tác migration gần nhất |
| `npm run db:seed:admin` | Tạo lại tài khoản System Admin |
| `npm run db:clean -- --yes` | **Xoá toàn bộ dữ liệu** (giữ cấu trúc bảng), tạo lại System Admin |
| `npm run test:e2e` | Chạy test tích hợp trên database riêng `kinderlog_test` |
| `npm run lint` / `npx tsc --noEmit` | Kiểm tra code / kiểu dữ liệu |
| `npm run format` | Định dạng code bằng Prettier |

---

## 5. Cấu trúc thư mục

```
BE/
├── src/
│   ├── main.ts, app.module.ts, app.setup.ts
│   ├── common/          # decorator, guard, enum, validator dùng chung
│   ├── config/          # đọc và kiểm tra biến môi trường
│   ├── database/        # data source, migration, seed, script dọn dữ liệu
│   └── modules/         # mỗi chức năng một module
├── test/                # test e2e (Jest + Supertest) và dữ liệu mẫu
├── uploads/             # ảnh, ghi âm khi lưu trên ổ đĩa (không đưa lên git)
├── docker-compose.yml   # SQL Server + Redis
└── .env.example         # mẫu cấu hình
```

| Module | Chức năng |
|---|---|
| `auth` | Đăng nhập, đổi mật khẩu, khoá đăng nhập sau 5 lần sai liên tiếp |
| `users`, `schools` | Tài khoản các vai trò, trường (tenant) |
| `academic-years` | Năm học và học kỳ |
| `classes`, `students` | Lớp, giáo viên chủ nhiệm, học sinh, liên kết phụ huynh – học sinh |
| `daily-journals` | Điểm danh, nhật ký từng trẻ, nhật ký lớp, ghi âm và AI tạo nháp, duyệt và xuất bản |
| `camera-streams` | Camera lớp học và khung giờ phụ huynh được xem |
| `messages`, `notifications`, `announcements` | Nhắn tin giáo viên – phụ huynh, thông báo, bảng tin trường |
| `reports` | Dashboard hiệu trưởng, xuất báo cáo PDF / Excel |
| `audit-logs` | Nhật ký thao tác (chỉ ghi thêm, không sửa / xoá) |
| `system`, `attribute-fields` | Cấu hình hệ thống, trường thuộc tính |
| `access`, `cache`, `storage` | Kiểm tra quyền theo trường / lớp, cache Redis, lưu file |

---

## 6. Một số quy tắc nghiệp vụ

- Giáo viên chỉ sửa nhật ký **trong ngày**; hiệu trưởng sửa được ngày cũ. Không ghi nhật ký cho ngày tương lai.
- Nhật ký do AI tạo luôn là **bản nháp**: giáo viên phải kiểm tra, duyệt rồi mới xuất bản cho phụ huynh.
- Tên trẻ nghe được từ giọng nói chỉ được gán khi khớp chính xác một bé trong lớp; trùng tên hoặc gần giống thì giữ lại để giáo viên chọn.
- Mỗi trường chỉ có một hiệu trưởng đang hoạt động; mỗi giáo viên chủ nhiệm một lớp trong một năm học.
- Điểm danh gồm: Có mặt, Vắng có phép, Vắng không phép.
- Phụ huynh chỉ xem camera của lớp con mình, trong khung giờ cho phép (tính theo giờ server, UTC+7).

Giới hạn đăng nhập có thể chỉnh trong `.env`: `LOGIN_MAX_FAILED` (mặc định 5 lần) và `LOGIN_LOCK_MINUTES` (mặc định 10 phút).

---

## 7. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `Unable to connect to the database` | Docker Desktop chưa bật, hoặc SQL Server chưa khởi động xong – đợi ~20 giây. Vẫn lỗi: `docker restart kinderlog-sqlserver` |
| `Port 3000 is already in use` | Đã có một bản backend đang chạy, tắt terminal cũ |
| Thiếu cột / bảng sau khi `git pull` | Chạy `npm run migration:run` |
| Sửa `.env` không có tác dụng | Backend chỉ đọc `.env` khi khởi động – tắt (`Ctrl+C`) và chạy lại |

> **Không đưa `.env` và thư mục `uploads/` lên git**: chứa mật khẩu, API key và ảnh của trẻ.
