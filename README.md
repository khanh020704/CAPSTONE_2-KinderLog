# KinderLog – Frontend

Giao diện web của hệ thống **KinderLog – Preschool Daily Journal & Reporting System with Multimodal AI Integration** (đồ án Capstone 2, nhóm C2SE.10).

Một ứng dụng duy nhất cho 4 vai trò: **System Admin, Hiệu trưởng, Giáo viên, Phụ huynh**. Giao diện Admin và Hiệu trưởng dùng tốt trên máy tính; Giáo viên và Phụ huynh dùng tốt trên điện thoại.

| Thành phần | Công nghệ |
|---|---|
| Framework | React 18 + Vite 5 |
| Điều hướng | React Router 6 |
| Icon | lucide-react |
| Camera lớp học | PeerJS (WebRTC), hls.js cho luồng HLS / MP4 |
| Font | Baloo 2, Nunito |

---

## 1. Yêu cầu

- **Node.js 20** trở lên
- Backend KinderLog đang chạy (mặc định `http://localhost:3000`) – xem `BE/README.md`
- Trình duyệt Chrome hoặc Edge (cần cho ghi âm nhật ký và camera)

> Trên Windows, nếu PowerShell báo *"running scripts is disabled"* thì dùng `npm.cmd` thay cho `npm`.

---

## 2. Cài đặt

```bash
cd FE
npm install
```

Mặc định frontend gọi backend ở `http://localhost:3000`. Chỉ khi backend chạy ở địa chỉ khác mới cần tạo file cấu hình:

```bash
cp .env.example .env.local      # Windows: copy .env.example .env.local
```

| Biến | Ý nghĩa |
|---|---|
| `VITE_BACKEND_URL` | Địa chỉ backend mà Vite chuyển tiếp các request `/api`, `/uploads` |
| `VITE_API_URL` | Đường dẫn API trình duyệt gọi – giữ `/api` khi chạy dev / preview |
| `VITE_INITIAL_PASSWORD` | Mật khẩu ban đầu hiển thị trong form, phải trùng `DEFAULT_PASSWORD` của backend |

**Camera qua mạng 4G** cần máy chủ TURN. Tạo file từ bản mẫu rồi điền tài khoản Metered:

```bash
cp public/ice-config.example.js public/ice-config.js
```

File `public/ice-config.js` chứa tài khoản riêng nên đã được bỏ qua trong git.

---

## 3. Chạy

```bash
npm run dev          # chạy dev tại http://localhost:5173
```

Bản build để demo hoặc chia sẻ qua ngrok:

```bash
npm run build        # build vào thư mục dist/
npm run preview      # chạy bản build tại http://localhost:4173
```

`preview` đã cho phép tên miền ngrok (`*.ngrok-free.dev`, `*.ngrok-free.app`), nên có thể mở tunnel trực tiếp: `ngrok http 4173`.

| Lệnh | Mục đích |
|---|---|
| `npm run dev` | Chạy dev, tự tải lại khi sửa code |
| `npm run build` | Build bản production |
| `npm run preview` | Chạy thử bản build |
| `npm run lint` | Kiểm tra code bằng ESLint |
| `npm run format` / `format:check` | Định dạng / kiểm tra định dạng bằng Prettier |

---

## 4. Cấu trúc thư mục

```
FE/
├── public/
│   ├── camera.html              # trang phát camera (thiết bị làm camera lớp học)
│   ├── viewer.html              # trang xem camera độc lập
│   └── ice-config.example.js    # mẫu cấu hình STUN / TURN
├── src/
│   ├── main.jsx, App.jsx        # khởi tạo ứng dụng và khai báo route
│   ├── styles.css
│   ├── components/              # khung trang, bảng CRUD, camera, chat, nhật ký, UI dùng chung
│   ├── lib/                     # gọi API, chuyển đổi dữ liệu, nhãn hiển thị, tiện ích
│   ├── pages/                   # màn hình theo vai trò
│   └── store/                   # phiên đăng nhập và trạng thái dùng chung
├── index.html
└── vite.config.js               # proxy /api về backend
```

| Trang | Vai trò | Màn hình chính |
|---|---|---|
| `auth.jsx`, `landing.jsx` | Mọi người | Trang giới thiệu, đăng nhập, quên mật khẩu |
| `admin.jsx` | System Admin | Dashboard, trường, hiệu trưởng, trường thuộc tính, cấu hình hệ thống, giám sát |
| `principal.jsx` | Hiệu trưởng | Hồ sơ trường, năm học – học kỳ, lớp, giáo viên, học sinh, phụ huynh, camera, báo cáo, thông báo |
| `teacher.jsx` | Giáo viên | Lớp của tôi, điểm danh, nhật ký (nhập tay hoặc ghi âm + AI), tin nhắn |
| `parent.jsx` | Phụ huynh | Nhật ký của con, camera lớp, tin nhắn, thông báo |
| `shared.jsx` | Nhiều vai trò | Hồ sơ cá nhân, đổi mật khẩu, nhật ký thao tác, thông báo |

---

## 5. Camera lớp học

Camera được mô phỏng bằng một thiết bị có webcam (laptop, điện thoại) phát hình qua PeerJS:

1. Hiệu trưởng vào **Camera Schedule**, ở camera cần phát chọn **Mở trang phát**.
   Hoặc mở trực tiếp `/camera.html?cam=<mã camera>` trên thiết bị làm camera.
2. Bấm **Bắt đầu phát** và cho phép trình duyệt dùng camera.
3. Phụ huynh của lớp mở mục **Camera** trong khung giờ được cho phép là xem được.

Trình duyệt chỉ cho dùng webcam trên `https` hoặc `localhost`, nên khi phát từ thiết bị khác cần dùng link ngrok.

---

## 6. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Đăng nhập báo *Cannot reach the server* | Backend chưa chạy – bật backend rồi tải lại trang |
| Mở qua ngrok báo *Blocked request. This host is not allowed* | Đang chạy `npm run dev`; chuyển sang `npm run build` + `npm run preview` |
| Link ngrok không có thay đổi mới | Chạy lại `npm run build` |
| Camera kẹt ở *Connecting…* khi dùng 4G | Kiểm tra `public/ice-config.js` có tài khoản TURN, rồi build lại |
| Ghi âm không được | Cho phép trình duyệt dùng micro, dùng Chrome hoặc Edge |
| Trang hiển thị sai chữ khi bật dịch tự động | Tắt dịch trang của trình duyệt cho địa chỉ KinderLog |
