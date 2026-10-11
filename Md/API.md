# KinderLog — Đặc tả API

Tài liệu này mô tả REST API mà backend cần cung cấp để thay thế kho dữ liệu giả lập của frontend (`FE/src/store/store.jsx`, đang lưu vào `localStorage`).

> **Trạng thái:** đây là bản **đề xuất hợp đồng API**. Repo hiện chưa có backend và frontend chưa gọi HTTP nào. Mô hình dữ liệu, ràng buộc, thông báo lỗi và tác dụng phụ bên dưới được rút ra từ hành vi thật của frontend; còn đường dẫn, cơ chế token, định dạng lỗi và phân trang là đề xuất, có thể điều chỉnh khi hai bên thống nhất.

## Mục lục

1. [Quy ước chung](#1-quy-ước-chung)
2. [Vai trò và phân quyền](#2-vai-trò-và-phân-quyền)
3. [Xác thực và tài khoản cá nhân](#3-xác-thực-và-tài-khoản-cá-nhân)
4. [System Admin](#4-system-admin)
5. [Principal — quản lý trường](#5-principal--quản-lý-trường)
6. [Camera](#6-camera)
7. [Điểm danh](#7-điểm-danh)
8. [Nhật ký hằng ngày (Daily Journal)](#8-nhật-ký-hằng-ngày-daily-journal)
9. [Tin nhắn](#9-tin-nhắn)
10. [Thông báo (Notifications)](#10-thông-báo-notifications)
11. [Thông báo trường (Announcements)](#11-thông-báo-trường-announcements)
12. [Báo cáo](#12-báo-cáo)
13. [Dashboard](#13-dashboard)
14. [Audit log](#14-audit-log)
15. [Tải tệp](#15-tải-tệp)
16. [Phụ lục](#16-phụ-lục)

---

## 1. Quy ước chung

### 1.1 Base URL và định dạng

| Mục | Giá trị |
| --- | --- |
| Base URL | `/api/v1` |
| Content-Type | `application/json; charset=utf-8` (trừ upload: `multipart/form-data`) |
| Xác thực | `Authorization: Bearer <accessToken>` |
| ID | Chuỗi (string), do server sinh |

### 1.2 Kiểu dữ liệu

| Kiểu | Định dạng | Ví dụ | Ghi chú |
| --- | --- | --- | --- |
| Ngày | `YYYY-MM-DD` | `2026-10-11` | Theo giờ địa phương của trường (Asia/Ho_Chi_Minh) |
| Giờ | `HH:mm` (24h) | `08:00` | Dùng cho lịch camera |
| Thời điểm | Số nguyên, epoch **mili giây** | `1791700000000` | Frontend đang tính `Date.now() - ts`, nên giữ dạng số để không phải sửa UI |
| Số điện thoại tài khoản | `^0\d{9}$` | `0903000001` | 10 chữ số, bắt đầu bằng 0 |
| Số điện thoại trường | `^0\d{9,10}$` | `02363888999` | Cho phép số bàn 11 chữ số |
| Email | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | | |

Chuỗi được `trim` trước khi lưu. Trường tùy chọn không có giá trị trả về `""` hoặc `null` (frontend xử lý được cả hai, riêng `lastLogin` cần `null`).

### 1.3 Trạng thái dùng chung

| Enum | Giá trị | Áp dụng cho |
| --- | --- | --- |
| `AccountStatus` | `Active`, `Inactive`, `Locked` | School, Principal, Teacher |
| `BasicStatus` | `Active`, `Inactive` | Class, Student, Parent, Relationship |

Tài khoản không ở trạng thái `Active` thì không đăng nhập được.

### 1.4 Danh sách: tìm kiếm, lọc, phân trang

Mọi endpoint `GET` trả danh sách nhận các tham số chung:

| Tham số | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `q` | string | | Tìm kiếm không phân biệt hoa thường **và không phân biệt dấu tiếng Việt** (`đ` ≡ `d`) |
| `page` | int | `1` | Trang, bắt đầu từ 1 |
| `size` | int | `8` | Số dòng mỗi trang (bảng CRUD dùng 8, audit log dùng 10) |
| `sort` | string | tùy tài nguyên | `tênTrường` hoặc `-tênTrường` (giảm dần) |

Phản hồi:

```json
{
  "items": [],
  "page": 1,
  "size": 8,
  "total": 31
}
```

### 1.5 Lỗi

```json
{
  "error": {
    "code": "PHONE_TAKEN",
    "message": "This phone number is already used by another account.",
    "fields": { "phone": "This phone number is already used by another account." }
  }
}
```

`fields` chỉ có khi lỗi gắn với trường cụ thể. `message` là câu frontend hiển thị trực tiếp, nên giữ đúng các câu tiếng Anh nêu trong tài liệu này.

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Thiếu trường bắt buộc, sai định dạng |
| 401 | `UNAUTHENTICATED` | Thiếu token, token hết hạn |
| 401 | `INVALID_CREDENTIALS` | Sai số điện thoại hoặc mật khẩu |
| 403 | `FORBIDDEN` | Sai vai trò, hoặc truy cập dữ liệu ngoài phạm vi |
| 403 | `ACCOUNT_INACTIVE` / `ACCOUNT_LOCKED` | Tài khoản không ở trạng thái `Active` |
| 404 | `NOT_FOUND` | Không có tài nguyên |
| 409 | `CONFLICT` và các mã cụ thể (`PHONE_TAKEN`, `NAME_TAKEN`, `SCHEDULE_OVERLAP`…) | Vi phạm ràng buộc duy nhất hoặc trạng thái |
| 422 | `INVALID_STATE` | Thao tác không hợp lệ với trạng thái hiện tại (ví dụ publish nhật ký chưa duyệt) |

Câu lỗi mặc định cho trường bắt buộc: `"<Nhãn trường> is required."`; số điện thoại: `"Enter a 10-digit phone number starting with 0."`; email: `"Enter a valid email address."`.

---

## 2. Vai trò và phân quyền

| Vai trò | `role` | Tạo bởi | Phạm vi dữ liệu |
| --- | --- | --- | --- |
| System Admin | `admin` | Hệ thống | Toàn nền tảng: trường, hiệu trưởng, cấu hình, audit log |
| Principal | `principal` | Admin | Một trường (`schoolId`) |
| Teacher | `teacher` | Principal | Lớp mình làm chủ nhiệm (một giáo viên ↔ tối đa một lớp) |
| Parent | `parent` | Principal | Các con được liên kết với trạng thái `Active` |

Không có tự đăng ký: mọi tài khoản đều do cấp trên tạo.

**Việc backend phải tự làm (frontend hiện không làm):**

- **Phạm vi trường.** Bản demo chỉ có một trường nên `teachers`, `classes`, `students`, `parents`… chưa có `schoolId`. Backend cần gắn `schoolId` cho các bảng này và luôn lọc theo trường của người gọi (lấy từ token, không nhận từ client).
- **Lọc dữ liệu phía server.** Frontend hiện tải toàn bộ dữ liệu rồi lọc trên trình duyệt. Với API thật, mọi quy tắc "ai được xem gì" trong tài liệu này phải được áp dụng ở server, đặc biệt là [ghi chú riêng của từng bé](#84-quyền-xem-của-phụ-huynh) và [luồng camera](#63-xem-camera).

---

## 3. Xác thực và tài khoản cá nhân

### 3.1 Đối tượng `User`

```json
{
  "id": "t1",
  "role": "teacher",
  "roleLabel": "Teacher",
  "name": "Nguyễn Thị Mai",
  "phone": "0903000001",
  "email": "mai.nguyen@kinderstars.edu.vn",
  "status": "Active",
  "createdAt": 1783060000000,
  "lastLogin": 1791698800000
}
```

Trường bổ sung theo vai trò:

| Vai trò | Trường thêm |
| --- | --- |
| `principal` | `schoolId` |
| `teacher` | `classId` (lớp chủ nhiệm, có thể `null`) |
| `parent` | `address`, `cameraAccess` (boolean) |

`roleLabel`: `System Admin`, `Principal`, `Teacher`, `Parent`.

### 3.2 `POST /auth/login`

Không cần token.

```json
{ "role": "teacher", "phone": "0903000001", "password": "123456", "remember": true }
```

| Trường | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `role` | có | `admin` \| `principal` \| `teacher` \| `parent`. Người dùng chọn vai trò trên màn hình đăng nhập, tài khoản được tra trong đúng vai trò đó |
| `phone` | có | Định dạng số điện thoại tài khoản |
| `password` | có | |
| `remember` | không | `true`: phiên dài (frontend lưu `localStorage`); `false`: phiên theo tab (`sessionStorage`) |

**200**

```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "expiresIn": 3600,
  "user": { "id": "t1", "role": "teacher", "…": "…" }
}
```

`expiresIn` nên lấy theo `settings.sessionTimeout` (phút). Đăng nhập thành công cập nhật `lastLogin`.

| HTTP | `code` | `message` |
| --- | --- | --- |
| 401 | `INVALID_CREDENTIALS` | `Incorrect phone number or password.` |
| 403 | `ACCOUNT_INACTIVE` | `This account is inactive. Please contact your school.` |
| 403 | `ACCOUNT_LOCKED` | `This account is locked. Please contact your school.` |

Với `role = principal`, đoạn cuối câu là `the system administrator` thay cho `your school`.

Tác dụng phụ: đăng nhập bị chặn vì trạng thái tài khoản ghi một dòng audit `Login` / `Authentication` / `Sign-in blocked: account is inactive` với `status = Failed`. Sai mật khẩu không ghi audit.

Sau khi đăng nhập, frontend chuyển về `/admin`, `/principal`, `/teacher` hoặc `/parent` theo `user.role`.

### 3.3 `POST /auth/refresh`

```json
{ "refreshToken": "…" }
```

**200** trả `accessToken`, `refreshToken`, `expiresIn` mới.

### 3.4 `POST /auth/logout`

Thu hồi refresh token hiện tại. **204**.

### 3.5 `POST /auth/forgot-password`

Không cần token.

```json
{ "email": "mai.nguyen@kinderstars.edu.vn" }
```

Tìm tài khoản theo email (không phân biệt hoa thường) trên cả bốn vai trò, rồi gửi email chứa liên kết đặt lại mật khẩu.

| HTTP | `code` | `message` |
| --- | --- | --- |
| 200 | | `{ "sent": true }` |
| 400 | `VALIDATION_ERROR` | `Enter a valid email address.` |
| 404 | `EMAIL_NOT_FOUND` | `We couldn't find an account with this email address.` |

> Frontend hiện hiển thị lỗi khi email không tồn tại. Cách này để lộ email nào có tài khoản; nếu muốn chặt hơn, luôn trả 200 và bỏ nhánh 404 ở UI.

Phụ huynh có thể không có email (trường tùy chọn). Khi đó họ nhờ hiệu trưởng dùng [đặt lại mật khẩu](#56-đặt-lại-mật-khẩu-và-đổi-trạng-thái-tài-khoản).

### 3.6 `POST /auth/reset-password`

Không cần token.

```json
{ "token": "<token trong email>", "newPassword": "…" }
```

Ràng buộc: `newPassword.length >= settings.passwordMin` → nếu sai: `Password must be at least {min} characters.`

**204**. Token sai hoặc hết hạn: **400** `RESET_TOKEN_INVALID`.

### 3.7 `GET /me`

Trả `User` của người gọi, kèm thông tin hiển thị ở trang hồ sơ:

| Vai trò | Thêm |
| --- | --- |
| `principal` | `school: { id, name }` |
| `teacher` | `class: { id, name }` hoặc `null` |
| `parent` | `children: [{ id, name, classId, className, relationship }]` |

### 3.8 `PATCH /me`

```json
{ "name": "Nguyễn Thị Mai", "phone": "0903000001", "email": "mai.nguyen@kinderstars.edu.vn" }
```

Cả ba trường bắt buộc. Trùng số điện thoại: **409** `PHONE_TAKEN` — `This phone number is already in use.`

Audit: `Update` / `Profile` / `Profile information updated`.

> Frontend hiện chỉ kiểm tra trùng số trong cùng vai trò ở màn hình này, trong khi các màn hình tạo tài khoản kiểm tra trên cả bốn vai trò. Backend nên áp dụng quy tắc chung: **số điện thoại duy nhất trên toàn hệ thống**.

### 3.9 `PUT /me/password`

```json
{ "currentPassword": "123456", "newPassword": "…" }
```

| Điều kiện | `fields` | `message` |
| --- | --- | --- |
| Sai mật khẩu hiện tại | `currentPassword` | `Current password is incorrect.` |
| Ngắn hơn `passwordMin` | `newPassword` | `Password must be at least {min} characters.` |
| Trùng mật khẩu cũ | `newPassword` | `New password must be different from the current one.` |

**204**. Audit: `Update` / `Authentication` / `Password changed`.

---

## 4. System Admin

Tất cả endpoint trong mục này yêu cầu `role = admin`.

### 4.1 Trường học

```json
{
  "id": "s1",
  "name": "Mầm non Kinder Stars",
  "address": "25 Nguyễn Văn Linh, Hải Châu, Đà Nẵng",
  "phone": "02363888999",
  "email": "lienhe@kinderstars.edu.vn",
  "principalId": "pr1",
  "principalName": "Trần Thị Lan",
  "status": "Active",
  "createdAt": 1781332000000,
  "counts": { "teachers": 4, "classes": 2, "students": 31 }
}
```

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/schools` | Danh sách. `q` tìm theo tên trường, tên hiệu trưởng, địa chỉ. Lọc: `status` |
| GET | `/schools/{id}` | Chi tiết |
| POST | `/schools` | Tạo |
| PUT | `/schools/{id}` | Sửa |
| PATCH | `/schools/{id}/status` | Đổi trạng thái (`Active` / `Inactive` / `Locked`) |

Frontend không có chức năng xóa trường.

Thân request `POST` / `PUT`:

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `name` | có | Duy nhất, không phân biệt hoa thường → 409 `NAME_TAKEN`: `A school with this name already exists.` |
| `address` | có | |
| `phone` | có | `^0\d{9,10}$` → `Enter a valid phone number.` |
| `email` | có | |
| `principalId` | không | Chỉ nhận hiệu trưởng chưa phụ trách trường khác |
| `status` | có | `AccountStatus` |

Quan hệ trường ↔ hiệu trưởng là 1–1 và phải đồng bộ hai chiều: gán `principalId` cho trường thì đặt `schoolId` của hiệu trưởng đó, đồng thời gỡ `schoolId` của hiệu trưởng cũ.

Audit: `Create` hoặc `Update` / `Schools` / `School created: {name}` hoặc `School updated: {name}`.

### 4.2 Hiệu trưởng

Đối tượng là `User` vai trò `principal`, kèm `schoolId` và `schoolName`.

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/principals` | `q`: tên, số điện thoại, email, tên trường. Lọc: `status` |
| GET | `/principals/{id}` | Chi tiết |
| POST | `/principals` | Tạo tài khoản |
| PUT | `/principals/{id}` | Sửa |
| PATCH | `/principals/{id}/status` | `Active` / `Inactive` / `Locked` |
| POST | `/principals/{id}/reset-password` | Đặt lại mật khẩu |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `name` | có | |
| `phone` | có | Duy nhất toàn hệ thống → 409 `PHONE_TAKEN`: `This phone number is already used by another account.` |
| `email` | có | |
| `schoolId` | không | Gán thì thay hiệu trưởng hiện tại của trường đó; đồng bộ hai chiều như mục 4.1 |
| `status` | có | `AccountStatus` |

Tài khoản mới nhận [mật khẩu khởi tạo](#161-mật-khẩu-khởi-tạo), `lastLogin = null`.

Audit: `Create` hoặc `Update` / `Principals` / `Principal account created: {name}` hoặc `Principal account updated: {name}`.

### 4.3 Cấu hình hệ thống

`GET /settings` — mọi vai trò đã đăng nhập đều đọc được (frontend cần `passwordMin`, `aiJournal`, `maxPhotos`). `passwordMin` cũng cần cho màn hình đặt lại mật khẩu khi chưa đăng nhập, nên trả nó trong `GET /settings/public`.

`PUT /settings` — chỉ `admin`.

```json
{
  "platformName": "KinderLog",
  "supportEmail": "hotro@kinderlog.vn",
  "sessionTimeout": 60,
  "passwordMin": 6,
  "aiJournal": true,
  "sttLanguage": "Vietnamese",
  "maxPhotos": 6
}
```

| Trường | Bắt buộc | Ràng buộc | Tác dụng |
| --- | --- | --- | --- |
| `platformName` | có | | |
| `supportEmail` | có | Email | |
| `sessionTimeout` | có | ≥ 5 → `Use at least 5 minutes.` | Thời hạn phiên (phút) |
| `passwordMin` | có | ≥ 6 → `Use at least 6 characters.` | Áp dụng khi đổi và đặt lại mật khẩu |
| `aiJournal` | có | boolean | `false`: giáo viên không dùng được ghi âm và bản nháp AI |
| `sttLanguage` | không | Hiện chỉ có `Vietnamese` | |
| `maxPhotos` | có | ≥ 1 → `Allow at least 1 photo.` | Số ảnh tối đa mỗi nhật ký |

> Frontend đang giữ ba giá trị số dưới dạng chuỗi (`"60"`, `"6"`, `"6"`) vì lấy từ ô nhập. API nên trả số; UI đã ép `Number(...)` khi dùng.

Audit: `Update` / `System Settings` / `Global settings updated`.

Nút "Reset demo data" ở màn hình này chỉ là tiện ích của bản demo, không cần endpoint.

### 4.4 Giám sát hệ thống

`GET /admin/monitoring`

Màn hình hiện dùng số liệu mẫu cố định. Hình dạng dữ liệu cần trả:

```json
{
  "checkedAt": 1791700000000,
  "health": "Healthy",
  "services": [
    { "name": "Web application", "status": "Operational", "detail": "Response time 182 ms" },
    { "name": "Database", "status": "Operational", "detail": "14 of 100 connections in use" },
    { "name": "File storage", "status": "Operational", "detail": "Photos and attachments" },
    { "name": "Notification service", "status": "Operational", "detail": "Queue empty" }
  ],
  "aiStatus": "Operational",
  "aiServices": [
    { "name": "Vietnamese Speech-to-Text", "status": "Operational", "detail": "Average transcription 4.1 s" },
    { "name": "Journal draft generation", "status": "Operational", "detail": "Average processing 6.2 s" }
  ],
  "resources": [
    { "key": "storage", "label": "Storage", "percent": 38, "text": "38.4 GB of 100 GB" },
    { "key": "cpu", "label": "CPU", "percent": 23, "text": "23% average load" },
    { "key": "memory", "label": "Memory", "percent": 54, "text": "4.3 GB of 8 GB" }
  ],
  "storage": [
    { "label": "Journal photos", "text": "24.1 GB" },
    { "label": "Voice recordings", "text": "9.8 GB" },
    { "label": "Profile photos", "text": "1.3 GB" },
    { "label": "Documents and exports", "text": "3.2 GB" }
  ]
}
```

---

## 5. Principal — quản lý trường

Tất cả endpoint trong mục này yêu cầu `role = principal` và chỉ thao tác trong trường của người gọi.

### 5.1 Hồ sơ trường

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/school` | Trường của hiệu trưởng đang đăng nhập, kèm `counts` và `currentYear: { id, name }` |
| PATCH | `/school` | Sửa `name`, `address`, `phone`, `email` (cả bốn bắt buộc, ràng buộc như mục 4.1) |

Hiệu trưởng không tự đổi `status` hay `principalId`. Chưa được gán trường: **404** — UI hiển thị "No school is linked to this account yet."

Audit: `Update` / `School Profile` / `School information updated: {name}`.

### 5.2 Năm học

```json
{ "id": "y2", "name": "2026–2027", "start": "2026-09-05", "end": "2027-05-31", "status": "Current", "classCount": 2 }
```

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/academic-years` | Sắp xếp `start` giảm dần |
| POST | `/academic-years` | Tạo |
| PUT | `/academic-years/{id}` | Sửa |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `name` | có | Duy nhất → 409: `This academic year already exists.` |
| `status` | có | `Current` \| `Upcoming` \| `Archived` |
| `start` | có | Ngày |
| `end` | có | Sau `start` → `End date must be after the start date.` |

**Chỉ có một năm học `Current`.** Khi lưu một năm với `status = Current`, năm `Current` trước đó tự chuyển thành `Archived` (trong cùng transaction).

Audit: `Create` hoặc `Update` / `Academic Year` / `Academic year created: {name}` hoặc `Academic year updated: {name}`.

### 5.3 Lớp học

```json
{
  "id": "c1",
  "name": "Mặt Trời 1",
  "yearId": "y2",
  "yearName": "2026–2027",
  "teacherId": "t1",
  "teacherName": "Nguyễn Thị Mai",
  "studentCount": 16,
  "status": "Active"
}
```

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/classes` | `q`: tên lớp, tên giáo viên. Lọc: `yearId`, `status` |
| GET | `/classes/{id}` | Chi tiết |
| POST | `/classes` | Tạo |
| PUT | `/classes/{id}` | Sửa |
| PATCH | `/classes/{id}/status` | `Active` / `Inactive` (lớp không có trạng thái `Locked`) |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `name` | có | Duy nhất, không phân biệt hoa thường → 409 `NAME_TAKEN`: `A class with this name already exists.` |
| `yearId` | có | Năm học chưa `Archived` |
| `teacherId` | không | Giáo viên đang `Active` |
| `status` | có | `BasicStatus` |

**Một giáo viên chỉ chủ nhiệm một lớp.** Gán `teacherId` cho lớp này thì gỡ giáo viên đó khỏi lớp đang chủ nhiệm (lớp kia về `teacherId = null`).

Audit: `Create` hoặc `Update` / `Classes` / `Class created: {name}` hoặc `Class updated: {name}`; đổi trạng thái: `Activate` hoặc `Deactivate` / `Classes` / `Class activated: {name}`.

### 5.4 Giáo viên

Đối tượng là `User` vai trò `teacher`, kèm `classId` và `className`.

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/teachers` | `q`: tên, số điện thoại, email, tên lớp. Lọc: `status` |
| GET | `/teachers/{id}` | Chi tiết |
| POST | `/teachers` | Tạo tài khoản |
| PUT | `/teachers/{id}` | Sửa |
| PATCH | `/teachers/{id}/status` | `Active` / `Inactive` / `Locked` |
| POST | `/teachers/{id}/reset-password` | Đặt lại mật khẩu |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `name` | có | |
| `phone` | có | Duy nhất toàn hệ thống → 409 `PHONE_TAKEN` |
| `email` | có | |
| `classId` | không | Gán thì giáo viên này thay chủ nhiệm hiện tại của lớp đó và rời lớp cũ. Bỏ trống thì rời lớp đang chủ nhiệm |
| `status` | có | `AccountStatus` |

Audit: `Create` hoặc `Update` / `Teachers` / `Teacher account created: {name}` hoặc `Teacher account updated: {name}`.

### 5.5 Học sinh, phụ huynh và liên kết

#### Học sinh

```json
{
  "id": "st1",
  "name": "Nguyễn Minh An",
  "dob": "2022-03-14",
  "gender": "Male",
  "classId": "c1",
  "className": "Mặt Trời 1",
  "status": "Active",
  "note": "",
  "photo": "https://…/st1.jpg",
  "parents": [
    { "linkId": "l1", "parentId": "par1", "name": "Nguyễn Thị Hương", "phone": "0904000001", "relationship": "Mother", "status": "Active" }
  ]
}
```

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/students` | `q`: tên bé, tên lớp, tên phụ huynh. Lọc: `classId`, `status` |
| GET | `/students/{id}` | Chi tiết |
| POST | `/students` | Thêm học sinh, có thể kèm tạo hoặc liên kết phụ huynh |
| PUT | `/students/{id}` | Sửa |
| DELETE | `/students/{id}` | Xóa học sinh **và mọi liên kết phụ huynh của bé** |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `name` | có | |
| `dob` | có | Không ở tương lai → `Date of birth cannot be in the future.` |
| `gender` | có | `Male` \| `Female` |
| `classId` | có | Lớp đang `Active` |
| `status` | có | `BasicStatus` |
| `note` | không | Ghi chú cho giáo viên (dị ứng, người đón…) |
| `photo` | không | URL ảnh từ [`POST /uploads`](#15-tải-tệp) |
| `parent` | không | Xem bên dưới |

Khối `parent` gộp ba lựa chọn của form thành một thao tác:

```json
{ "mode": "new", "name": "Nguyễn Thị Hương", "phone": "0904000001", "relationship": "Mother" }
```

```json
{ "mode": "existing", "parentId": "par1", "relationship": "Father" }
```

```json
{ "mode": "later" }
```

| `mode` | Hành vi |
| --- | --- |
| `new` | Tạo tài khoản phụ huynh (`status = Active`, `cameraAccess = true`, email và địa chỉ trống, mật khẩu khởi tạo) rồi liên kết với bé. Trùng số điện thoại → 409 `PHONE_TAKEN`: `This parent's phone number already belongs to an account. Choose “Parent already has an account” instead.` |
| `existing` | Liên kết với phụ huynh đã có. Nếu cặp (phụ huynh, bé) đã liên kết thì chỉ cập nhật `relationship` |
| `later` | Không đụng tới liên kết |

Toàn bộ thao tác (học sinh + phụ huynh + liên kết) phải nằm trong một transaction.

Tác dụng phụ:

- Thêm mới hoặc chuyển lớp: gửi thông báo cho giáo viên chủ nhiệm lớp nhận — `Class roster updated` / `{tên bé} was added to {tên lớp}.`
- Audit: `Create` hoặc `Update` / `Students` / `Student added: {name}` hoặc `Student information updated: {name}`. Tạo phụ huynh kèm theo ghi thêm `Create` / `Parents` / `Parent account created: {name}`. Xóa: `Delete` / `Students` / `Student deleted: {name}`.

#### Phụ huynh

Đối tượng là `User` vai trò `parent`, kèm `children: [{ linkId, studentId, name, className, relationship, status }]`.

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/parents` | `q`: tên, số điện thoại, email, tên con. Lọc: `status` |
| GET | `/parents/{id}` | Chi tiết |
| POST | `/parents` | Tạo tài khoản, có thể kèm nhập học hoặc liên kết con |
| PUT | `/parents/{id}` | Sửa |
| PATCH | `/parents/{id}/status` | `Active` / `Inactive` (phụ huynh không có `Locked`) |
| POST | `/parents/{id}/reset-password` | Đặt lại mật khẩu |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `name` | có | |
| `phone` | có | Duy nhất toàn hệ thống → 409 `PHONE_TAKEN` |
| `email` | không | Cần có để tự đặt lại mật khẩu qua email |
| `address` | không | |
| `status` | có | `BasicStatus` |
| `cameraAccess` | có | `true`: được xem camera trong khung giờ; `false`: không được xem |
| `child` | không | Đối xứng với khối `parent` của học sinh |

```json
{ "mode": "new", "name": "Nguyễn Minh An", "dob": "2022-03-14", "gender": "Male", "classId": "c1", "relationship": "Mother" }
```

```json
{ "mode": "existing", "studentId": "st1", "relationship": "Mother" }
```

`mode = new` tạo học sinh (`status = Active`) với cùng ràng buộc và cùng thông báo cho giáo viên như khi thêm học sinh trực tiếp.

Audit: `Create` hoặc `Update` / `Parents` / `Parent account created: {name}` hoặc `Parent account updated: {name}`.

#### Liên kết phụ huynh – con

Liên kết quyết định phụ huynh nào xem được nhật ký, tin nhắn và camera của bé nào. Chỉ liên kết `Active` mới có hiệu lực.

```json
{
  "id": "l1",
  "parentId": "par1",
  "parentName": "Nguyễn Thị Hương",
  "parentPhone": "0904000001",
  "studentId": "st1",
  "studentName": "Nguyễn Minh An",
  "className": "Mặt Trời 1",
  "relationship": "Mother",
  "status": "Active"
}
```

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/relationships` | `q`: tên phụ huynh, tên bé, quan hệ, lớp. Lọc: `relationship`, `status` |
| POST | `/relationships` | Tạo liên kết |
| PUT | `/relationships/{id}` | Sửa |
| DELETE | `/relationships/{id}` | Gỡ liên kết |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `parentId` | có | |
| `studentId` | có | Cặp (`parentId`, `studentId`) duy nhất → 409 `LINK_EXISTS`: `This parent is already linked to this child.` |
| `relationship` | có | `Mother` \| `Father` \| `Grandmother` \| `Grandfather` \| `Guardian` |
| `status` | có | `BasicStatus` |

Một phụ huynh có thể có nhiều con, một bé có thể có nhiều phụ huynh.

Audit: `Create`, `Update` hoặc `Delete` / `Relationships` / `Parent relationship created: {phụ huynh} → {bé}` (tương tự `updated`, `removed`).

### 5.6 Đặt lại mật khẩu và đổi trạng thái tài khoản

Dùng chung cho `/principals`, `/teachers`, `/parents`.

`POST /{loại}/{id}/reset-password` — đưa mật khẩu về [mật khẩu khởi tạo](#161-mật-khẩu-khởi-tạo). **204**. Audit: `Update` / `{Principals|Teachers|Parents}` / `{Principal|Teacher|Parent} password reset: {name}`.

`PATCH /{loại}/{id}/status`

```json
{ "status": "Locked" }
```

Trả đối tượng đã cập nhật. Audit theo trạng thái đích:

| Trạng thái đích | `action` | `description` |
| --- | --- | --- |
| `Active` | `Activate` | `{Loại} activated: {name}` |
| `Inactive` | `Deactivate` | `{Loại} deactivated: {name}` |
| `Locked` | `Lock` | `{Loại} locked: {name}` |

Khóa hoặc vô hiệu hóa một tài khoản nên thu hồi luôn các phiên đang mở của tài khoản đó.

---

## 6. Camera

### 6.1 Danh sách camera

```json
{ "id": "cam1", "name": "Camera 01", "classId": "c1", "className": "Mặt Trời 1" }
```

`GET /cameras` — `principal`. Frontend chưa có màn hình thêm, sửa, xóa camera; camera được cấu hình sẵn theo lớp.

Mỗi phần tử kèm trạng thái hiện tại:

```json
{
  "id": "cam1",
  "name": "Camera 01",
  "classId": "c1",
  "className": "Mặt Trời 1",
  "state": "live",
  "schedule": { "id": "sch1", "date": "2026-10-11", "start": "08:00", "end": "09:30" }
}
```

| `state` | Điều kiện (tính trên các lịch `enabled` của lớp trong hôm nay) |
| --- | --- |
| `live` | Có lịch với `start <= giờ hiện tại < end`; `schedule` là lịch đó |
| `scheduled` | Không có lịch đang mở nhưng còn lịch có `start > giờ hiện tại`; `schedule` là lịch gần nhất |
| `unavailable` | Còn lại; `schedule = null` |

### 6.2 Lịch xem camera

```json
{
  "id": "sch1",
  "classId": "c1",
  "cameraId": "cam1",
  "date": "2026-10-11",
  "start": "08:00",
  "end": "09:30",
  "enabled": true,
  "status": "Live Now"
}
```

`status` là giá trị tính toán, không lưu:

| `status` | Điều kiện |
| --- | --- |
| `Disabled` | `enabled = false` |
| `Ended` | Ngày đã qua, hoặc hôm nay và `end <= giờ hiện tại` |
| `Live Now` | Hôm nay và `start <= giờ hiện tại < end` |
| `Scheduled` | Còn lại |

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/camera-schedules` | `principal`. `q`: tên lớp, tên camera, ngày. Lọc: `classId`, `status`. Mặc định sắp xếp `date` giảm dần rồi `start` tăng dần |
| POST | `/camera-schedules` | Tạo |
| PUT | `/camera-schedules/{id}` | Sửa |
| PATCH | `/camera-schedules/{id}` | Bật hoặc tắt: `{ "enabled": false }` |
| DELETE | `/camera-schedules/{id}` | Xóa |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `classId` | có | |
| `cameraId` | có | Camera phải thuộc lớp đó → `This camera belongs to another class.` |
| `date` | có | |
| `start` | có | |
| `end` | có | Sau `start` → `End time must be after the start time.` |
| `enabled` | có | boolean |

Chống trùng lịch: hai lịch cùng `cameraId`, cùng `date`, **cùng đang `enabled`** không được giao nhau (`a.start < b.end && b.start < a.end`) → 409 `SCHEDULE_OVERLAP`: `This camera already has a viewing time that overlaps with this one.` Cần kiểm tra cả khi bật lại một lịch đang tắt.

Tác dụng phụ:

- Tạo hoặc sửa với `enabled = true`: gửi thông báo cho phụ huynh của lớp — `Camera schedule updated` / `{lớp} camera: {ngày}, {start}–{end}.`
- Audit: `Create`, `Update` hoặc `Delete` / `Camera Schedule` / `Camera schedule created: {lớp} · {ngày} {start}–{end}` (tương tự `updated`, `enabled`, `disabled`, `deleted`).

### 6.3 Xem camera

`GET /cameras/{id}/stream` — trả URL phát có thời hạn ngắn.

```json
{ "url": "https://…/live/cam1.m3u8?token=…", "expiresAt": 1791700300000 }
```

| Vai trò | Điều kiện |
| --- | --- |
| `principal` | Camera thuộc trường mình; xem được bất cứ lúc nào |
| `parent` | Đủ cả ba: `cameraAccess = true`; có liên kết `Active` với một bé thuộc lớp của camera; camera đang ở `state = live` |
| Khác | 403 |

Lỗi cho phụ huynh:

| HTTP | `code` | Hiển thị ở UI |
| --- | --- | --- |
| 403 | `CAMERA_ACCESS_DENIED` | `Camera access is not available for this account.` |
| 403 | `CAMERA_NOT_LIVE` | `The classroom camera is currently unavailable.` |

URL phát phải hết hạn không muộn hơn `end` của khung giờ đang mở; khi lịch bị tắt hoặc xóa giữa chừng, luồng của phụ huynh phải dừng.

`GET /parent/camera?studentId={id}` — dữ liệu cho màn hình camera của phụ huynh:

```json
{
  "allowed": true,
  "classId": "c1",
  "className": "Mặt Trời 1",
  "cameraId": "cam1",
  "state": "scheduled",
  "schedule": { "id": "sch2", "date": "2026-10-11", "start": "14:00", "end": "15:30" },
  "upcoming": [
    { "id": "sch2", "date": "2026-10-11", "start": "14:00", "end": "15:30" },
    { "id": "sch3", "date": "2026-10-12", "start": "08:00", "end": "09:30" }
  ]
}
```

`upcoming`: tối đa 6 lịch `enabled` có `date >= hôm nay` của lớp, sắp xếp theo `date` rồi `start`. Khi `allowed = false`, không trả `state`, `schedule`, `upcoming`.

---

## 7. Điểm danh

Mỗi (lớp, ngày) có tối đa một bảng điểm danh.

```json
{
  "classId": "c1",
  "date": "2026-10-11",
  "savedAt": 1791691600000,
  "records": {
    "st1": { "status": "present", "note": "" },
    "st9": { "status": "absent", "note": "Gia đình xin nghỉ, bé bị sốt nhẹ" }
  },
  "counts": { "total": 16, "present": 15, "absent": 1, "unrecorded": 0, "recorded": true }
}
```

| Trường | Ghi chú |
| --- | --- |
| `records` | Map `studentId → { status, note }`. Bé chưa được đánh dấu thì không có khóa trong map |
| `status` | `present` \| `absent` |
| `note` | Tùy chọn: lý do nghỉ, hoặc ghi chú như "đến muộn" |
| `counts.total` | Số học sinh `Active` của lớp |
| `counts.unrecorded` | `total - present - absent` (không âm) |
| `counts.recorded` | `false` khi chưa có bảng điểm danh cho ngày đó |

### `GET /attendance?classId={id}&date={ngày}`

`teacher` (chỉ lớp mình) hoặc `principal`. Chưa có bảng: **200** với `records = {}`, `savedAt = null`, `counts.recorded = false`.

### `PUT /attendance`

`teacher`, chỉ lớp mình chủ nhiệm.

```json
{
  "classId": "c1",
  "date": "2026-10-11",
  "records": {
    "st1": { "status": "present", "note": "" },
    "st9": { "status": "absent", "note": "Sốt nhẹ" }
  }
}
```

- Ghi đè toàn bộ bảng của (lớp, ngày); `savedAt` là thời điểm lưu.
- `date` không ở tương lai. Được sửa lại ngày cũ.
- Cho phép lưu khi còn bé chưa được đánh dấu.
- `studentId` phải thuộc lớp.

Audit: `Update` / `Attendance` / `Attendance saved: {tên lớp}`.

### Phụ huynh

Phụ huynh không đọc bảng điểm danh của lớp. Họ chỉ nhận bản ghi của chính con mình qua [`GET /parent/home`](#134-phụ-huynh) và [`GET /parent/journals`](#84-quyền-xem-của-phụ-huynh).

---

## 8. Nhật ký hằng ngày (Daily Journal)

Nguyên tắc sản phẩm: **AI gợi ý → giáo viên kiểm tra → giáo viên quyết định.** Không có gì được gửi tới phụ huynh nếu giáo viên chưa duyệt và bấm publish.

### 8.1 Đối tượng `Journal`

```json
{
  "id": "j1",
  "classId": "c1",
  "date": "2026-10-10",
  "status": "published",
  "source": "voice",
  "sections": {
    "meal": "Các con ăn ngon miệng…",
    "learning": "Cả lớp tham gia hoạt động vẽ tranh…",
    "sleep": "Các con ngủ trưa khoảng 90 phút.",
    "health": "Không có biểu hiện bất thường.",
    "emotion": "Các con vui vẻ, hoạt bát.",
    "note": "Nhắc phụ huynh mang áo khoác cho bé."
  },
  "personal": {
    "st1": "Minh An mạnh dạn giơ tay phát biểu, cô khen con trước lớp."
  },
  "photos": ["https://…/j1-1.jpg", "https://…/j1-2.jpg"],
  "transcript": "Hôm nay các con ăn ngon miệng. …",
  "audio": ["https://…/j1-rec1.webm"],
  "updatedAt": 1791600000000,
  "publishedAt": 1791600000000
}
```

| Trường | Ghi chú |
| --- | --- |
| `classId` + `date` | Duy nhất: mỗi lớp mỗi ngày một nhật ký. `date` không ở tương lai |
| `status` | `draft` \| `review` \| `approved` \| `published` |
| `source` | `manual` \| `voice`. Chuyển thành `voice` ngay khi có một lần ghi âm |
| `sections` | Sáu mục cố định, dùng chung cho cả lớp. Mục trống là `""` |
| `personal` | Map `studentId → ghi chú riêng`. Mục có nội dung rỗng bị loại khi lưu |
| `photos` | Danh sách URL, tối đa `settings.maxPhotos` |
| `transcript` | Văn bản chuyển từ giọng nói, chỉ giáo viên xem |
| `audio` | Các bản ghi âm gốc, chỉ giáo viên xem |
| `publishedAt` | `null` cho tới khi publish |

Sáu mục của `sections`:

| Khóa | Nhãn | Giờ hiển thị trên dòng thời gian | Tiêu đề trên dòng thời gian |
| --- | --- | --- | --- |
| `meal` | Meal | 11:30 | Lunch |
| `learning` | Learning | 09:30 | Learning Activity |
| `sleep` | Sleep | 13:00 | Nap |
| `health` | Health | | Health |
| `emotion` | Emotion | | Emotion |
| `note` | Special Note | | Note from the teacher |

Nhãn trạng thái ở UI: `draft` → Draft, `review` → Needs Review, `approved` → Approved, `published` → Published.

### 8.2 Vòng đời

```
manual:  (tạo) ──► draft ──────┐
                               ├──► approved ──► published
voice:   (tạo) ──► review ─────┘
                     ▲               │
                     └── sửa nội dung ┘   (sửa sau khi duyệt → quay về draft/review)
```

| Chuyển trạng thái | Điều kiện |
| --- | --- |
| Tạo → `draft` | Viết tay |
| Tạo → `review` | Từ bản nháp giọng nói |
| `draft` / `review` → `approved` | Ít nhất một mục `sections` hoặc một ghi chú `personal` có nội dung. Nếu không: 422 — `Add content to at least one section before approving.` |
| `approved` → `draft` / `review` | Tự động khi nội dung thay đổi sau khi duyệt: về `review` nếu `source = voice`, về `draft` nếu `manual` |
| Bất kỳ trạng thái chưa publish → `review` | Ghi âm thêm; nội dung mới được **nối vào**, không thay thế |
| `approved` → `published` | Chỉ từ `approved`. Nếu không: 422 `INVALID_STATE` |
| `published` | Chỉ đọc. Frontend không có chức năng sửa hay gỡ nhật ký đã publish |

### 8.3 Endpoint cho giáo viên

Tất cả yêu cầu `role = teacher` và nhật ký thuộc lớp mình chủ nhiệm.

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/journals` | Lịch sử của lớp, `date` giảm dần. Lọc: `status` (`draft`, `review` gồm cả `approved`, `published`), `date` |
| GET | `/journals/{id}` | Chi tiết đầy đủ |
| POST | `/journals` | Tạo nhật ký cho một ngày |
| PUT | `/journals/{id}` | Lưu nháp |
| POST | `/journals/{id}/approve` | Duyệt |
| POST | `/journals/{id}/publish` | Gửi cho phụ huynh |
| POST | `/journals/{id}/recordings` | Ghi âm thêm vào bản nháp |
| POST | `/journals/voice-draft` | Chuyển bản ghi âm thành bản nháp (chưa lưu) |

#### `POST /journals`

```json
{ "date": "2026-10-11", "source": "manual" }
```

Với `source = voice`, gửi kèm kết quả của `voice-draft`:

```json
{
  "date": "2026-10-11",
  "source": "voice",
  "sections": { "meal": "…", "learning": "…", "sleep": "", "health": "", "emotion": "", "note": "" },
  "personal": { "st1": "…" },
  "transcript": "…",
  "audio": ["https://…/rec1.webm"]
}
```

**201** trả `Journal`. Đã có nhật ký cho (lớp, ngày): 409 `JOURNAL_EXISTS`. `source = voice` khi `settings.aiJournal = false`: 403 `AI_DISABLED`.

#### `PUT /journals/{id}`

```json
{
  "sections": { "meal": "…", "learning": "…", "sleep": "…", "health": "…", "emotion": "…", "note": "…" },
  "personal": { "st1": "…", "st4": "…" },
  "photos": ["https://…/a.jpg"]
}
```

- Thay toàn bộ `sections`, `personal`, `photos`.
- Khóa của `personal` phải là học sinh `Active` của lớp.
- Quá `maxPhotos` ảnh: 400.
- Nhật ký đang `approved` mà nội dung khác bản đã lưu → trạng thái tự về `draft` / `review`. Nội dung không đổi thì giữ `approved`.
- Nhật ký đã `published`: 422 `INVALID_STATE`.

#### `POST /journals/{id}/approve` và `POST /journals/{id}/publish`

Không có thân request (frontend lưu nội dung trước rồi mới gọi). Trả `Journal` đã cập nhật.

Tác dụng phụ của **publish**:

1. Thông báo cho mọi phụ huynh của lớp: `type = journal`, `New journal published` / `The daily journal for {lớp} is ready to view.`
2. Với mỗi bé có ghi chú riêng: thông báo cho **từng phụ huynh có liên kết `Active` với bé đó** — `A note about {tên bé}` / `The teacher wrote a personal note in today's journal.`
3. Audit: `Publish` / `Daily Journal` / `Journal published: {lớp}`.

#### `POST /journals/voice-draft`

`multipart/form-data`:

| Phần | Kiểu | Ghi chú |
| --- | --- | --- |
| `audio` | file | Bản ghi âm (trình duyệt gửi định dạng của `MediaRecorder`, thường `audio/webm`) |
| `classId` | string | Để lấy danh sách học sinh `Active` phục vụ nhận diện tên |

**200**

```json
{
  "transcript": "Hôm nay các con ăn ngon miệng. Bé An ngủ hơi muộn",
  "sections": { "meal": "Hôm nay các con ăn ngon miệng.", "learning": "", "sleep": "", "health": "", "emotion": "", "note": "" },
  "personal": { "st1": "Bé An ngủ hơi muộn." },
  "audioUrl": "https://…/rec1.webm"
}
```

Kết quả chỉ là bản nháp: không lưu, không publish. Lỗi: 422 `NO_SPEECH` — `We couldn't process the recording. No speech was detected. Please try again.`; 403 `AI_DISABLED`.

Quy tắc phân loại mà frontend đang mô phỏng (backend thay bằng dịch vụ AI thật, giữ nguyên hình dạng đầu ra):

- Tách bản ghi thành câu. **Câu nhắc tên một bé trong lớp** đi vào `personal` của bé đó, không vào phần chung của lớp. Nhận diện theo họ tên đầy đủ, hai từ cuối của tên ("Minh An"), hoặc dạng "bé An" khi trong lớp chỉ có một bé tên đó. "Các bạn Nam" không phải bé tên Nam.
- Các câu còn lại xếp theo chủ đề vào `meal`, `learning`, `sleep`, `health`, `emotion`; không khớp chủ đề nào thì vào `note`.

> Hiện tại chuyển giọng nói thành văn bản chạy trong trình duyệt (Web Speech API, `vi-VN`, chỉ Chrome và Edge). Nếu nhóm giữ cách này, endpoint có thể nhận `transcript` dạng văn bản thay cho `audio` và chỉ làm bước phân loại.

#### `POST /journals/{id}/recordings`

Thân request giống kết quả của `voice-draft`. Server nối từng mục `sections`, từng ghi chú `personal` và `transcript` vào nội dung hiện có (cách nhau một dấu cách), thêm `audioUrl` vào `audio`, đặt `source = voice` và `status = review`.

### 8.4 Quyền xem của phụ huynh

`GET /parent/journals?studentId={id}` — danh sách nhật ký **đã publish** của lớp bé, `date` giảm dần. Tham số `month=YYYY-MM` để tô các ngày có nhật ký trên lịch.

```json
{ "items": [{ "id": "j1", "date": "2026-10-10" }, { "id": "j2", "date": "2026-10-09" }] }
```

`GET /parent/journals/by-date?studentId={id}&date={ngày}` — nhật ký của một ngày. Không có: **404**.

```json
{
  "id": "j1",
  "classId": "c1",
  "date": "2026-10-10",
  "sections": { "meal": "…", "learning": "…", "sleep": "…", "health": "…", "emotion": "…", "note": "…" },
  "personalNote": "Minh An mạnh dạn giơ tay phát biểu, cô khen con trước lớp.",
  "photos": ["https://…/j1-1.jpg"],
  "attendance": { "status": "present", "note": "" },
  "publishedAt": 1791600000000
}
```

**Quy tắc bắt buộc ở server:**

- `studentId` phải có liên kết `Active` với phụ huynh đang gọi, nếu không: 403.
- Chỉ trả nhật ký `published`.
- **Không trả map `personal`.** Chỉ trả `personalNote` là ghi chú của đúng bé được hỏi (chuỗi rỗng nếu không có). Ghi chú về bé khác không bao giờ được rời khỏi server.
- Không trả `transcript`, `audio`, `source`.
- `attendance` là bản ghi điểm danh của riêng bé trong ngày đó (`null` nếu chưa điểm danh). UI dùng nó để thêm dòng "Arrival 07:45 — Arrived safely." hoặc "Absent today. {lý do}".

---

## 9. Tin nhắn

Trò chuyện 1–1 giữa một phụ huynh và một giáo viên. Chỉ có văn bản: không tệp đính kèm, không ghi âm, không trả lời tự động bằng AI. Chỉ `teacher` và `parent` dùng.

### 9.1 Ai nói chuyện được với ai

| Người gọi | Danh sách hội thoại |
| --- | --- |
| `teacher` | Mọi phụ huynh có liên kết `Active` với một học sinh thuộc lớp mình chủ nhiệm |
| `parent` | Giáo viên chủ nhiệm của lớp mà con mình (liên kết `Active`) đang học |

Hội thoại xuất hiện trong danh sách ngay cả khi chưa có tin nhắn nào. Gửi tin cho người ngoài danh sách: 403.

### 9.2 `GET /conversations`

```json
{
  "items": [
    {
      "peerId": "par1",
      "name": "Nguyễn Thị Hương",
      "sub": "Mother of Nguyễn Minh An",
      "unread": 1,
      "last": { "id": "m4", "from": "parent", "text": "Cảm ơn cô nhiều ạ…", "at": 1791697000000 }
    }
  ]
}
```

| Trường | Ghi chú |
| --- | --- |
| `peerId` | ID người còn lại (phụ huynh nếu người gọi là giáo viên, và ngược lại) |
| `sub` | Giáo viên thấy `{quan hệ} of {tên bé}`; phụ huynh thấy `Teacher · {tên lớp}` |
| `unread` | Số tin từ phía bên kia mà mình chưa đọc |
| `last` | Tin mới nhất, `null` nếu chưa có |

Sắp xếp theo `last.at` giảm dần. Giáo viên có thể tìm bằng `q` trên `name` và `sub`.

### 9.3 `GET /conversations/{peerId}/messages`

Tham số: `before` (epoch ms) và `limit` để tải dần tin cũ. Trả theo thời gian tăng dần.

```json
{
  "items": [
    { "id": "m1", "parentId": "par1", "teacherId": "t1", "from": "parent", "text": "Chào cô Mai…", "at": 1791606000000, "read": true }
  ]
}
```

`from`: `parent` \| `teacher`. `read`: người nhận đã đọc hay chưa.

### 9.4 `POST /conversations/{peerId}/messages`

```json
{ "text": "Trưa nay bé An ngủ được khoảng 90 phút." }
```

`text` sau khi `trim` không được rỗng. **201** trả tin nhắn vừa tạo (`read = false`).

Tác dụng phụ: thông báo cho người nhận — `type = message`, `Message from {tên người gửi}`, nội dung là tin nhắn cắt còn 70 ký tự kèm `…` nếu dài hơn.

### 9.5 `POST /conversations/{peerId}/read`

Đánh dấu đã đọc mọi tin do phía bên kia gửi trong hội thoại. **204**. Frontend gọi khi mở hội thoại có tin chưa đọc.

### 9.6 Số tin chưa đọc

`GET /conversations/unread-count` → `{ "count": 2 }`. Dùng cho huy hiệu trên menu.

> Frontend hiện không có cơ chế thời gian thực. Bản đầu có thể polling `GET /conversations`; nếu thêm WebSocket hoặc SSE thì đẩy sự kiện `message.created` và `notification.created`.

---

## 10. Thông báo (Notifications)

Thông báo trong ứng dụng, sinh ra từ các thao tác khác. Không có endpoint tạo thông báo thủ công.

### 10.1 Đối tượng

```json
{
  "id": "n4",
  "type": "camera",
  "title": "Camera schedule updated",
  "body": "Mặt Trời 1 camera is available today during the scheduled time.",
  "at": 1791691000000,
  "read": false
}
```

`type`: `announcement` \| `journal` \| `camera` \| `message` \| `system`.

Mô hình lưu trữ gợi ý (theo cách frontend đang làm): mỗi thông báo có `role` đích, tùy chọn `userId` (gửi riêng một người) hoặc `classId` (gửi theo lớp), và danh sách người đã đọc. API chỉ trả `read` của riêng người gọi.

### 10.2 Ai nhận thông báo nào

Một thông báo hiển thị cho người dùng khi thỏa cả ba:

1. `role` của thông báo trùng vai trò người dùng;
2. `userId` trống, hoặc bằng ID người dùng;
3. `classId` trống, hoặc thuộc các lớp của người dùng — với phụ huynh là lớp của các con có liên kết `Active`, với giáo viên là lớp chủ nhiệm.

### 10.3 Endpoint

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/notifications` | Thông báo của người gọi, `at` giảm dần. Lọc: `unread=true` |
| GET | `/notifications/unread-count` | `{ "count": 3 }` |
| POST | `/notifications/read` | Đánh dấu đã đọc: `{ "ids": ["n1", "n4"] }` hoặc `{ "all": true }`. **204** |

Bấm vào thông báo, UI đánh dấu đã đọc rồi điều hướng theo `type`:

| Vai trò | `message` | `journal` | `camera` | `announcement` | Khác |
| --- | --- | --- | --- | --- | --- |
| `teacher` | `/teacher/messages` | `/teacher/journal` | mở hộp thoại | mở hộp thoại | mở hộp thoại |
| `parent` | `/parent/messages` | `/parent/journal` | `/parent/camera` | `/parent/announcements` | mở hộp thoại |

### 10.4 Bảng sự kiện sinh thông báo

| Sự kiện | Người nhận | `type` | `title` | `body` |
| --- | --- | --- | --- | --- |
| Publish thông báo trường | Mọi giáo viên và/hoặc mọi phụ huynh, theo `audience` | `announcement` | Tiêu đề thông báo trường | Nội dung, cắt còn 110 ký tự + `…` |
| Publish nhật ký | Phụ huynh của lớp | `journal` | `New journal published` | `The daily journal for {lớp} is ready to view.` |
| Publish nhật ký có ghi chú riêng | Phụ huynh (liên kết `Active`) của bé | `journal` | `A note about {bé}` | `The teacher wrote a personal note in today's journal.` |
| Tạo hoặc sửa lịch camera đang bật | Phụ huynh của lớp | `camera` | `Camera schedule updated` | `{lớp} camera: {ngày}, {start}–{end}.` |
| Gửi tin nhắn | Người nhận tin | `message` | `Message from {người gửi}` | Tin nhắn, cắt còn 70 ký tự + `…` |
| Thêm học sinh hoặc chuyển lớp | Giáo viên chủ nhiệm lớp nhận | `system` | `Class roster updated` | `{bé} was added to {lớp}.` |

`{ngày}` theo định dạng UI `11 Oct 2026`.

Thông báo cho hiệu trưởng (lớp chưa điểm danh, nhật ký chưa xong, lớp chưa có chủ nhiệm) không lưu trữ: chúng được tính từ dữ liệu trong ngày và trả trong [dashboard hiệu trưởng](#132-hiệu-trưởng), tự biến mất khi việc được làm xong.

---

## 11. Thông báo trường (Announcements)

```json
{
  "id": "an1",
  "title": "Holiday Notice",
  "content": "Nhà trường nghỉ ngày thứ Hai tuần tới…",
  "audience": "Teachers & Parents",
  "category": "Holiday",
  "publishDate": "2026-10-10",
  "expiryDate": "2026-10-17",
  "status": "Published",
  "createdAt": 1791620000000
}
```

### 11.1 Quản lý (`principal`)

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| GET | `/announcements` | `q`: tiêu đề, nội dung, loại. Lọc: `category`, `status`. Mặc định `createdAt` giảm dần |
| GET | `/announcements/{id}` | Chi tiết |
| POST | `/announcements` | Tạo; `status` quyết định lưu nháp hay publish ngay |
| PUT | `/announcements/{id}` | Sửa |
| POST | `/announcements/{id}/publish` | Publish một bản nháp |
| DELETE | `/announcements/{id}` | Xóa với mọi người |

| Trường | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `title` | có | |
| `category` | có | `Holiday` \| `School Activity` \| `Important Notice` \| `Reminder` |
| `audience` | có | `Teachers` \| `Parents` \| `Teachers & Parents` |
| `publishDate` | có | |
| `expiryDate` | không | Không trước `publishDate` → `Expiry date cannot be before the publish date.` |
| `content` | có | |
| `status` | có | `Draft` \| `Published` |

Tác dụng phụ:

- **Chỉ lần đầu chuyển sang `Published`** mới gửi thông báo (mục 10.4) và ghi audit `Publish` / `Announcements` / `Announcement published: {title}`. Sửa một thông báo đã publish không gửi lại.
- Lưu nháp: `Create` / `Announcements` / `Announcement saved as draft: {title}`. Sửa: `Update` / … / `Announcement updated: {title}`. Xóa: `Delete` / … / `Announcement deleted: {title}`.

> Frontend gửi thông báo ngay lúc publish, kể cả khi `publishDate` ở tương lai, trong khi phụ huynh chỉ thấy bài từ `publishDate`. Backend nên hoãn gửi thông báo tới `publishDate` để hai thứ khớp nhau.

### 11.2 Phụ huynh

`GET /parent/announcements` — chỉ trả bài thỏa cả bốn:

- `status = Published`
- `audience` là `Parents` hoặc `Teachers & Parents`
- `publishDate <= hôm nay`
- `expiryDate` trống hoặc `>= hôm nay`

Sắp xếp `publishDate` giảm dần, rồi `createdAt` giảm dần. Trả `id`, `title`, `content`, `category`, `publishDate`.

Giáo viên chưa có màn hình danh sách thông báo trường; họ nhận nội dung qua [thông báo](#10-thông-báo-notifications).

---

## 12. Báo cáo

`GET /reports/{type}` — `principal`.

| Tham số | Áp dụng | Ghi chú |
| --- | --- | --- |
| `from`, `to` | `attendance`, `journal`, `activity` | Khoảng ngày, tính cả hai đầu. Mặc định 7 ngày gần nhất; `to` không ở tương lai |
| `classId` | Mọi loại | Bỏ trống: tất cả lớp |
| `format` | Mọi loại | `json` (mặc định) hoặc `csv` |

Phản hồi JSON có dạng bảng để UI hiển thị trực tiếp:

```json
{
  "head": ["Date", "Class", "Present", "Absent", "Not recorded", "Attendance rate"],
  "rows": [["11 Oct 2026", "Mặt Trời 1", 15, 1, 0, "94%"]]
}
```

| `type` | Cột | Nguồn và cách tính |
| --- | --- | --- |
| `attendance` | Date, Class, Present, Absent, Not recorded, Attendance rate | Mỗi bảng điểm danh một dòng. Tỉ lệ = `present / total`, làm tròn; `—` khi `total = 0` |
| `journal` | Date, Class, Status, Created with, Photos, Last edited | Mỗi nhật ký một dòng, mọi trạng thái. "Created with": `Voice (AI-assisted)` hoặc `Manual entry` |
| `activity` | Class, Head Teacher, Students, Days with attendance, Journals published, Photos shared, Messages | Mỗi lớp một dòng, tính trong khoảng ngày. "Messages" là số tin nhắn của giáo viên chủ nhiệm |
| `students` | Full Name, Date of Birth, Gender, Class, Parent, Status | Mỗi học sinh một dòng; nhiều phụ huynh nối bằng `, ` |
| `parents` | Parent, Phone, Child, Class, Relationship, Status | Mỗi liên kết phụ huynh–con một dòng; `Status` là trạng thái tài khoản phụ huynh |

`attendance` và `journal` sắp xếp theo ngày giảm dần rồi tên lớp.

Xuất tệp: frontend hiện tự tạo CSV trên trình duyệt (tên `kinderlog-{type}-{ngày}.csv`) và dùng lệnh in của trình duyệt cho PDF. `format=csv` là tùy chọn cho dữ liệu lớn; CSV phải là UTF-8 **có BOM** để Excel đọc đúng tiếng Việt, mọi ô bọc trong dấu nháy kép.

---

## 13. Dashboard

Mỗi vai trò có một endpoint tổng hợp để trang chủ chỉ cần một request.

### 13.1 Admin

`GET /admin/dashboard`

```json
{
  "schools": { "total": 1, "active": 1, "inactiveOrLocked": 0 },
  "principals": 1,
  "school": {
    "id": "s1", "name": "Mầm non Kinder Stars", "address": "…", "status": "Active",
    "principalName": "Trần Thị Lan",
    "counts": { "teachers": 4, "classes": 2, "students": 31 }
  },
  "audit": { "eventsToday": 3, "failedToday": 0 },
  "recentAdminActivity": [],
  "recentAudit": []
}
```

`recentAdminActivity`: 5 dòng audit mới nhất của admin. `recentAudit`: 4 dòng mới nhất toàn hệ thống. Thẻ giám sát lấy từ `GET /admin/monitoring`.

### 13.2 Hiệu trưởng

`GET /principal/dashboard`

```json
{
  "date": "2026-10-11",
  "stats": {
    "classes": 2,
    "students": 31,
    "teachers": 3,
    "present": 15,
    "attendanceTotal": 31,
    "journalsCompleted": 0,
    "unreadMessages": 2
  },
  "attendance": { "present": 15, "absent": 1, "unrecorded": 15 },
  "journals": { "completed": 0, "inProgress": 1, "notStarted": 1 },
  "classes": [
    {
      "id": "c1", "name": "Mặt Trời 1", "teacherName": "Nguyễn Thị Mai",
      "students": 16,
      "attendance": { "recorded": true, "present": 15, "absent": 1 },
      "journal": "Not Started"
    }
  ],
  "cameras": [],
  "attention": [
    { "kind": "attendance", "title": "Attendance not recorded", "body": "Mặt Trời 2 has not recorded attendance today.", "classId": "c2" }
  ],
  "recentActivity": []
}
```

| Trường | Cách tính |
| --- | --- |
| `stats.classes`, `students`, `teachers` | Chỉ đếm bản ghi `Active` |
| `stats.unreadMessages` | Mọi tin nhắn chưa đọc giữa giáo viên và phụ huynh trong trường |
| `classes[].journal` | `Not Started` (chưa có nhật ký hôm nay), `In Progress` (có nhưng chưa publish), `Completed` (đã publish) |
| `cameras` | Như `GET /cameras` |
| `attention` | Tính từ dữ liệu hôm nay: lớp chưa có chủ nhiệm (`No head teacher`), lớp chưa điểm danh (`Attendance not recorded`), lớp chưa xong nhật ký (`Journal in progress` hoặc `Journal not started`) |
| `recentActivity` | 6 dòng audit mới nhất của trường (không gồm thao tác của admin) |

### 13.3 Giáo viên

`GET /teacher/dashboard`

```json
{
  "date": "2026-10-11",
  "class": { "id": "c1", "name": "Mặt Trời 1" },
  "students": 16,
  "attendance": { "total": 16, "present": 15, "absent": 1, "unrecorded": 0, "recorded": true },
  "journal": { "id": "j9", "status": "draft" },
  "pendingReviews": 0,
  "unreadMessages": 2
}
```

`class = null` khi giáo viên chưa được phân lớp; khi đó các trường còn lại không có và UI hiển thị "You have not been assigned to a class yet." `journal = null` khi hôm nay chưa có nhật ký. `pendingReviews`: số nhật ký của lớp đang ở `review`.

`GET /teacher/class` — danh sách lớp chỉ đọc (học sinh do hiệu trưởng quản lý):

```json
{
  "class": { "id": "c1", "name": "Mặt Trời 1" },
  "students": [
    {
      "id": "st1", "name": "Nguyễn Minh An", "dob": "2022-03-14", "gender": "Male",
      "photo": "", "note": "",
      "today": "present",
      "parents": [{ "name": "Nguyễn Thị Hương", "phone": "0904000001", "relationship": "Mother" }]
    }
  ]
}
```

Chỉ gồm học sinh `Active`; `parents` chỉ gồm liên kết `Active`. `today`: `present` \| `absent` \| `null`.

### 13.4 Phụ huynh

`GET /parent/children` — các con có liên kết `Active`:

```json
{
  "items": [
    {
      "id": "st1", "name": "Nguyễn Minh An", "photo": "", "relationship": "Mother",
      "classId": "c1", "className": "Mặt Trời 1", "teacherId": "t1", "teacherName": "Nguyễn Thị Mai"
    }
  ]
}
```

Danh sách rỗng: UI hiển thị "No child is linked to this account yet."

`GET /parent/home?studentId={id}`

```json
{
  "date": "2026-10-11",
  "child": { "id": "st1", "name": "Nguyễn Minh An", "photo": "", "className": "Mặt Trời 1", "teacherName": "Nguyễn Thị Mai" },
  "attendance": { "status": "present", "note": "" },
  "todayJournal": { "id": "j9", "sections": { "meal": "…" }, "personalNote": "" },
  "latestJournal": { "id": "j1", "date": "2026-10-10", "preview": "Minh An mạnh dạn giơ tay phát biểu…", "photos": ["…"] },
  "announcement": { "id": "an1", "title": "Holiday Notice", "content": "…" },
  "camera": { "allowed": true, "state": "live", "schedule": { "start": "08:00", "end": "09:30" } },
  "unreadMessages": 0,
  "unreadNotifications": 2
}
```

| Trường | Ghi chú |
| --- | --- |
| `attendance` | Bản ghi của riêng bé hôm nay, `null` nếu chưa điểm danh |
| `todayJournal` | Nhật ký **đã publish** của hôm nay, `null` nếu chưa có. Áp dụng quy tắc lọc ở mục 8.4 |
| `latestJournal` | Nhật ký đã publish gần nhất. `preview` lấy theo thứ tự ưu tiên: ghi chú riêng của bé → `note` → `learning` → `meal` → `emotion`. `photos`: tối đa 2 ảnh |
| `announcement` | Bài mới nhất theo quy tắc mục 11.2, `null` nếu không có |
| `camera` | Như `GET /parent/camera`, không cần `upcoming` |

---

## 14. Audit log

Ghi lại các thao tác quan trọng. Server tự ghi; không có endpoint ghi từ client.

```json
{
  "id": "au7",
  "at": 1791624400000,
  "user": "Nguyễn Thị Mai",
  "role": "Teacher",
  "action": "Publish",
  "module": "Daily Journal",
  "description": "Journal published: Mặt Trời 1",
  "status": "Success"
}
```

`GET /audit-logs`

| Vai trò | Phạm vi |
| --- | --- |
| `admin` | Toàn bộ |
| `principal` | Chỉ hoạt động trong trường mình, không gồm thao tác của System Admin |

| Tham số | Ý nghĩa |
| --- | --- |
| `q` | Tìm trên `user`, `description`, `module` |
| `date` | Một ngày cụ thể |
| `role` | `System Admin` \| `Principal` \| `Teacher` \| `Parent` |
| `action` | Xem bảng dưới |
| `page`, `size` | `size` mặc định 10 |

Sắp xếp `at` giảm dần. Để dựng hai ô lọc, phản hồi kèm `facets: { roles: [...], actions: [...] }` gồm các giá trị thực sự có trong phạm vi.

Giá trị đang dùng:

| Trường | Giá trị |
| --- | --- |
| `action` | `Login`, `Create`, `Update`, `Delete`, `Activate`, `Deactivate`, `Lock`, `Publish` |
| `module` | `Authentication`, `Profile`, `Schools`, `Principals`, `System Settings`, `School Profile`, `Academic Year`, `Classes`, `Teachers`, `Students`, `Parents`, `Relationships`, `Camera Schedule`, `Announcements`, `Attendance`, `Daily Journal` |
| `status` | `Success`, `Failed` |

`description` của từng thao tác được ghi ở mục tương ứng trong tài liệu này. Nên lưu thêm `userId` và `schoolId` để lọc phạm vi; `user` và `role` là bản chụp tên và nhãn vai trò tại thời điểm thao tác.

---

## 15. Tải tệp

Frontend hiện nhúng ảnh dưới dạng data URL vào `localStorage`. Với backend thật, ảnh được tải lên trước rồi tham chiếu bằng URL.

`POST /uploads` — `multipart/form-data`

| Phần | Ghi chú |
| --- | --- |
| `file` | Ảnh (`image/*`) |
| `purpose` | `student-photo` (`principal`) hoặc `journal-photo` (`teacher`) |

**201**

```json
{ "url": "https://…/uploads/abc123.jpg", "contentType": "image/jpeg", "size": 482113 }
```

Ghi chú triển khai:

- Ảnh nhật ký và ảnh học sinh là dữ liệu trẻ em: URL không nên công khai vĩnh viễn. Dùng URL có chữ ký, hoặc phục vụ qua endpoint có kiểm tra quyền (phụ huynh chỉ xem ảnh nhật ký của lớp con mình).
- Giới hạn `maxPhotos` được kiểm tra ở `PUT /journals/{id}`, không phải ở bước upload.
- Dữ liệu mẫu có các giá trị ảnh dạng `demo:drawing`, `demo:meal`, `demo:play`, `demo:book`. Đây là ảnh minh họa dựng sẵn của bản demo, không phải định dạng cần hỗ trợ.

---

## 16. Phụ lục

### 16.1 Mật khẩu khởi tạo

Bản demo dùng chung một mật khẩu khởi tạo `123456` cho mọi tài khoản mới và cho thao tác "Reset Password", và UI hiển thị thẳng giá trị này cho người tạo tài khoản. Khi làm backend thật, nhóm cần chọn một trong hai:

1. **Giữ hành vi demo** — đơn giản nhất cho buổi bảo vệ, nhưng mọi tài khoản mới đều có mật khẩu đoán được.
2. **Mật khẩu tạm ngẫu nhiên** — `POST` tạo tài khoản và `reset-password` trả `{ "temporaryPassword": "…" }` một lần duy nhất, kèm cờ `mustChangePassword` trên `User` để buộc đổi ở lần đăng nhập đầu. Cách này cần sửa nhỏ ở UI (các câu gợi ý "Initial password: 123456").

Dù chọn cách nào, mật khẩu phải được băm (bcrypt hoặc argon2); không lưu dạng rõ như bản demo.

### 16.2 Tài khoản mẫu

| Vai trò | Số điện thoại | Tên | Ghi chú |
| --- | --- | --- | --- |
| Admin | `0901000001` | Lê Quang Huy | |
| Principal | `0902000001` | Trần Thị Lan | Trường Mầm non Kinder Stars |
| Teacher | `0903000001` | Nguyễn Thị Mai | Chủ nhiệm Mặt Trời 1 |
| Teacher | `0903000002` | Phạm Thu Hà | Chủ nhiệm Mặt Trời 2 |
| Teacher | `0903000003` | Lê Thị Ngọc Ánh | Chưa có lớp |
| Teacher | `0903000004` | Đỗ Thị Thanh Vân | `Inactive` — dùng để thử đăng nhập bị chặn |
| Parent | `0904000001` … `0904000031` | | Mỗi phụ huynh một con; `par1` là mẹ của Nguyễn Minh An |

Mật khẩu của tất cả: `123456`. Dữ liệu mẫu đầy đủ nằm ở `FE/src/store/seed.js` và có thể dùng làm seed cho cơ sở dữ liệu.

### 16.3 Bảng endpoint

| Method | Đường dẫn | Vai trò |
| --- | --- | --- |
| POST | `/auth/login` | công khai |
| POST | `/auth/refresh` | công khai |
| POST | `/auth/logout` | mọi vai trò |
| POST | `/auth/forgot-password` | công khai |
| POST | `/auth/reset-password` | công khai |
| GET, PATCH | `/me` | mọi vai trò |
| PUT | `/me/password` | mọi vai trò |
| GET | `/settings`, `/settings/public` | mọi vai trò / công khai |
| PUT | `/settings` | admin |
| GET | `/admin/dashboard`, `/admin/monitoring` | admin |
| GET, POST | `/schools` | admin |
| GET, PUT | `/schools/{id}` | admin |
| PATCH | `/schools/{id}/status` | admin |
| GET, POST | `/principals` | admin |
| GET, PUT | `/principals/{id}` | admin |
| PATCH | `/principals/{id}/status` | admin |
| POST | `/principals/{id}/reset-password` | admin |
| GET | `/audit-logs` | admin, principal |
| GET | `/principal/dashboard` | principal |
| GET, PATCH | `/school` | principal |
| GET, POST | `/academic-years` | principal |
| PUT | `/academic-years/{id}` | principal |
| GET, POST | `/classes` | principal |
| GET, PUT | `/classes/{id}` | principal |
| PATCH | `/classes/{id}/status` | principal |
| GET, POST | `/teachers` | principal |
| GET, PUT | `/teachers/{id}` | principal |
| PATCH | `/teachers/{id}/status` | principal |
| POST | `/teachers/{id}/reset-password` | principal |
| GET, POST | `/students` | principal |
| GET, PUT, DELETE | `/students/{id}` | principal |
| GET, POST | `/parents` | principal |
| GET, PUT | `/parents/{id}` | principal |
| PATCH | `/parents/{id}/status` | principal |
| POST | `/parents/{id}/reset-password` | principal |
| GET, POST | `/relationships` | principal |
| PUT, DELETE | `/relationships/{id}` | principal |
| GET | `/cameras` | principal |
| GET | `/cameras/{id}/stream` | principal, parent |
| GET, POST | `/camera-schedules` | principal |
| PUT, PATCH, DELETE | `/camera-schedules/{id}` | principal |
| GET | `/reports/{type}` | principal |
| GET, POST | `/announcements` | principal |
| GET, PUT, DELETE | `/announcements/{id}` | principal |
| POST | `/announcements/{id}/publish` | principal |
| GET | `/teacher/dashboard`, `/teacher/class` | teacher |
| GET | `/attendance` | teacher, principal |
| PUT | `/attendance` | teacher |
| GET, POST | `/journals` | teacher |
| GET, PUT | `/journals/{id}` | teacher |
| POST | `/journals/{id}/approve` | teacher |
| POST | `/journals/{id}/publish` | teacher |
| POST | `/journals/{id}/recordings` | teacher |
| POST | `/journals/voice-draft` | teacher |
| GET | `/parent/children`, `/parent/home` | parent |
| GET | `/parent/journals`, `/parent/journals/by-date` | parent |
| GET | `/parent/camera` | parent |
| GET | `/parent/announcements` | parent |
| GET | `/conversations`, `/conversations/unread-count` | teacher, parent |
| GET, POST | `/conversations/{peerId}/messages` | teacher, parent |
| POST | `/conversations/{peerId}/read` | teacher, parent |
| GET | `/notifications`, `/notifications/unread-count` | mọi vai trò |
| POST | `/notifications/read` | mọi vai trò |
| POST | `/uploads` | principal, teacher |

### 16.4 Điểm cần nhóm thống nhất

Những chỗ hành vi frontend hiện tại chưa nhất quán hoặc chưa đủ cho backend thật, đã nêu rải rác ở trên:

| # | Vấn đề | Mục |
| --- | --- | --- |
| 1 | Dữ liệu chưa có `schoolId`; cần thêm để hỗ trợ nhiều trường | 2 |
| 2 | Kiểm tra trùng số điện thoại ở trang hồ sơ hẹp hơn ở trang tạo tài khoản | 3.8 |
| 3 | Quên mật khẩu để lộ email nào có tài khoản | 3.5 |
| 4 | Mật khẩu khởi tạo dùng chung `123456` | 16.1 |
| 5 | Thông báo trường gửi ngay lúc publish dù `publishDate` ở tương lai | 11.1 |
| 6 | Chuyển giọng nói thành văn bản chạy ở trình duyệt hay ở server | 8.3 |
| 7 | Chưa có cơ chế thời gian thực cho tin nhắn và thông báo | 9.6 |
| 8 | Chưa có màn hình quản lý camera và danh sách thông báo trường cho giáo viên | 6.1, 11.2 |
