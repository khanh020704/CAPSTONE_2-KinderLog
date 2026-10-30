# CAPSTONE_2-KinderLog
Preschool Daily Journal &amp; Reporting System with Multimodal AI Integration

| Phần | Công nghệ | Địa chỉ khi chạy |
|---|---|---|
| Backend (`BE/`) | NestJS 11, TypeORM, SQL Server 2022, Redis 7 | http://localhost:3000/api · tài liệu API: http://localhost:3000/api/docs |
| Frontend (`FE/`) | React 18, Vite | http://localhost:5173 |
| AI (tuỳ chọn) | Groq: Whisper large-v3 (giọng nói → chữ), gpt-oss-120b (nháp nhật ký) | — |

## 1. Cài đặt một lần

### Yêu cầu
- **Node.js** 20 trở lên (kèm npm)
- **Docker Desktop** (chạy SQL Server và Redis)
- Trình duyệt Chrome hoặc Edge (ghi âm nhật ký bằng giọng nói)

> Windows: nếu PowerShell báo lỗi *"running scripts is disabled"* khi gõ `npm`, dùng `npm.cmd` thay cho `npm`
> trong mọi lệnh bên dưới (ví dụ `npm.cmd install`).

### Backend
```bash
cd BE
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```
Mở `BE/.env` và điền:
- `JWT_SECRET`: một chuỗi ngẫu nhiên dài.
- `ADMIN_PHONE`, `ADMIN_PASSWORD`: tài khoản System Admin đầu tiên (mật khẩu ≥ 10 ký tự, có chữ và số).
- `GROQ_API_KEY` *(tuỳ chọn)*: key lấy ở https://console.groq.com (bắt đầu bằng `gsk_`). Không có key thì
  nháp nhật ký được tạo bằng bộ quy tắc từ khoá và lời nói được trình duyệt chuyển thành chữ.

Các giá trị còn lại (cổng, mật khẩu SQL Server `DB_PASSWORD`, Redis…) để mặc định là chạy được.

```bash
docker compose up -d        # SQL Server :1433 + Redis :6379 (lần đầu SQL Server cần ~20 giây để sẵn sàng)
npm install
npm run migration:run       # tạo database "kinderlog" và các bảng
npm run db:seed:admin       # tạo tài khoản System Admin từ ADMIN_PHONE / ADMIN_PASSWORD
```

### Frontend
```bash
cd FE
npm install
```
Frontend mặc định gọi backend ở `http://localhost:3000`. Chỉ khi backend chạy ở địa chỉ khác mới cần chép
`FE/.env.example` thành `FE/.env.local` và sửa `VITE_BACKEND_URL`.

## 2. Chạy dự án hằng ngày

Mở 2 cửa sổ terminal:

```bash
# Terminal 1 — backend
cd BE
docker compose up -d        # bật SQL Server + Redis nếu chưa chạy
npm run start:dev           # http://localhost:3000/api
```

```bash
# Terminal 2 — frontend
cd FE
npm run dev                 # http://localhost:5173
```

Mở http://localhost:5173/login, chọn vai trò **System Admin** và đăng nhập bằng `ADMIN_PHONE` / `ADMIN_PASSWORD`.
Database mới là database trống: admin tạo trường và tài khoản Hiệu trưởng; Hiệu trưởng tạo lớp, giáo viên,
học sinh và tài khoản phụ huynh. Tài khoản do admin/hiệu trưởng tạo có mật khẩu ban đầu là `DEFAULT_PASSWORD`
trong `.env` (mặc định `123456`).

Kiểm tra nhanh backend: http://localhost:3000/health trả về `"db":"up"`; mục `ai` cho biết đang dùng Groq hay
bộ quy tắc từ khoá.

Dừng dự án: `Ctrl+C` ở hai terminal; `docker compose stop` (trong `BE`) để tắt SQL Server và Redis.

## 3. Lệnh hữu ích

| Thư mục | Lệnh | Mục đích |
|---|---|---|
| `BE` | `npm run test:e2e` | Chạy toàn bộ test tích hợp (dùng database riêng `kinderlog_test`, cần Docker đang chạy) |
| `BE` | `npm run lint` · `npx tsc --noEmit` | Kiểm tra code / kiểu TypeScript |
| `BE` | `npm run migration:run` | Áp dụng migration mới sau khi cập nhật code |
| `BE` | `npm run db:clean` | **Xoá toàn bộ dữ liệu** (giữ cấu trúc bảng) rồi tạo lại System Admin |
| `FE` | `npm run lint` · `npm run build` | Kiểm tra code / build bản production vào `FE/dist` |

## 4. Lỗi thường gặp

- **Backend báo không kết nối được database**: Docker Desktop chưa bật, hoặc SQL Server vừa khởi động — đợi
  ~20 giây rồi chạy lại. Xem trạng thái bằng `docker ps` (cột STATUS phải là `healthy`).
- **`Port 3000/5173 is already in use`**: đã có một bản đang chạy; tắt terminal cũ hoặc tiến trình đang giữ cổng.
- **Sửa `BE/.env` nhưng không có tác dụng**: backend chỉ đọc `.env` khi khởi động — dừng (`Ctrl+C`) rồi chạy lại
  `npm run start:dev`.
- **Ghi âm không được**: cho phép trình duyệt dùng micro cho `localhost:5173`; dùng Chrome hoặc Edge.
- **Giao diện hiển thị sai chữ / trắng trang khi bật dịch trang**: tắt tính năng dịch tự động của trình duyệt cho
  `localhost:5173` (biểu tượng dịch trên thanh địa chỉ → "Không bao giờ dịch trang web này").

> Không đưa `BE/.env` lên git (đã có trong `.gitignore`): file này chứa mật khẩu và API key.
> `BE/.env.example` là bản mẫu không có bí mật, dùng để tạo `.env` trên máy mới.
