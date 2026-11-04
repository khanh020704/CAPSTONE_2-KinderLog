# KinderLog

**Preschool Daily Journal & Reporting System with Multimodal AI Integration**

KinderLog là nền tảng web giúp trường mầm non ghi lại một ngày của trẻ và chia sẻ với phụ huynh. Giáo viên có thể ghi nhật ký bằng giọng nói tiếng Việt, AI chuyển thành bản nháp có cấu trúc, giáo viên kiểm tra rồi mới gửi đến phụ huynh. Nhà trường quản lý lớp, giáo viên, học sinh và theo dõi số liệu tổng hợp; phụ huynh xem nhật ký, nhắn tin với giáo viên và xem camera lớp học trong khung giờ cho phép.

---

## Người dùng

| Vai trò | Công việc chính |
|---|---|
| **System Admin** | Quản lý các trường trên nền tảng và tài khoản hiệu trưởng, cấu hình hệ thống |
| **Hiệu trưởng** | Quản lý trường, năm học, lớp, giáo viên, học sinh, camera; xem báo cáo |
| **Giáo viên** | Điểm danh, ghi nhật ký (nhập tay hoặc giọng nói), duyệt và gửi cho phụ huynh |
| **Phụ huynh** | Xem nhật ký của con, nhận thông báo, nhắn tin với giáo viên, xem camera lớp |

Mỗi trường là một không gian dữ liệu riêng, người dùng chỉ thấy dữ liệu trong phạm vi được phân quyền.

---

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Frontend | React 18, Vite, React Router |
| Backend | NestJS 11 (TypeScript), TypeORM |
| Cơ sở dữ liệu | Microsoft SQL Server 2022, Redis 7 |
| AI | Groq API – Whisper large-v3, GPT-OSS 120B |
| Camera | PeerJS (WebRTC) |
| Lưu trữ ảnh | ImageKit.io |
| Môi trường | Docker, Node.js 20 |

---

## Cấu trúc repository

```
CAPSTONE_2-KinderLog/
├── BE/          # API backend (NestJS)
├── FE/          # Giao diện web (React)
└── docs/        # Tài liệu đồ án
```

Hướng dẫn cài đặt và chạy chi tiết:

- Backend: [`BE/README.md`](BE/README.md)
- Frontend: [`FE/README.md`](FE/README.md)

---

## Chạy nhanh

Cần cài sẵn **Node.js 20** và **Docker Desktop**.

```bash
# Backend
cd BE
cp .env.example .env            # điền JWT_SECRET, tài khoản admin, Groq key
docker compose up -d
npm install
npm run migration:run
npm run db:seed:admin
npm run start:dev               # http://localhost:3000/api

# Frontend (terminal khác)
cd FE
npm install
npm run dev                     # http://localhost:5173
```

---

## Nhóm phát triển

| Thành viên | Vai trò |
|---|---|
| Hồ Ngọc Đăng Khánh | Scrum Master, Developer |
| Hồ A Bảo | Product Owner, Developer |
| Lê Nhật Anh | Developer |
| Võ Lê Duy | Developer |

