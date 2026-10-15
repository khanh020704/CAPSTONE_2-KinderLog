# Báo cáo kiểm thử tích hợp hệ thống — PDJRS (KinderLog)

Ngày kiểm thử: 14–15/10/2026 · Môi trường: Windows 11, Node.js 24, PostgreSQL 16 + Redis 7 (Docker), `AI_MODE=mock`
Phạm vi: Backend NestJS (`BE/`), Frontend React + Vite (`FE/`), tích hợp FE ↔ BE qua proxy Vite.

## 1. Tổng hợp

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| BE E2E (`npm run test:e2e`) | **PASS — 59/59** | 36 s, chạy trên DB được seed lại trước mỗi lần |
| BE TypeScript (`tsc --noEmit`) | **PASS** | 0 lỗi |
| BE ESLint (`npm run lint`, src + test) | **PASS** | 0 lỗi, 0 cảnh báo |
| BE Prettier (`npm run format:check`) | **PASS** | |
| BE build (`npm run build`) | **PASS** | |
| FE ESLint (`npm run lint`) | **PASS / WARNING** | 0 lỗi, 24 cảnh báo `react-refresh/only-export-components` (chỉ ảnh hưởng hot-reload khi dev) |
| FE Prettier (`npm run format:check`) | **PASS** | sau khi thêm cấu hình và định dạng lại |
| FE build (`npm run build`) | **PASS** | không còn cảnh báo kích thước chunk |
| Kiểm thử tích hợp trên trình duyệt (16 kịch bản) | **PASS 16/16** sau khi sửa lỗi | 5 lỗi phát hiện, đã sửa cả 5 |
| Cảnh báo còn tồn tại | **3 WARNING** | xem mục 5 |

## 2. Backend E2E — `BE/test/app.e2e-spec.ts`

Chạy toàn bộ `AppModule` thật (guard, pipe, filter, TypeORM, Redis) bằng Jest + Supertest.

| Nhóm | Số test | Nội dung chính |
|---|---|---|
| 1. Health | 1 | `/health` công khai, DB up |
| 2. Xác thực & JWT | 13 | 4 vai trò, `/auth/me`, sai mật khẩu 401, sai vai trò 401, tài khoản ngưng 403, SĐT sai định dạng 400, không token 401, **token giả mạo 401**, **token hết hạn 401** |
| 3. RBAC & đa trường | 8 | giáo viên chỉ thấy lớp mình, phụ huynh không xem sổ lớp, **hiệu trưởng trường khác không thấy học sinh** (403), tìm kiếm không dấu |
| 4. Bulk logging | 8 | mẫu chung + **3 ngoại lệ**, chặn dữ liệu sai (400), chặn ngày tương lai / quá 7 ngày, bản nháp không lộ cho phụ huynh, ảnh gắn cho 15 bé có mặt, chặn file không phải ảnh |
| 5. AI Voice-to-JSON | 5 | trích xuất từ văn bản (3 ngoại lệ), **hồi quy "sốt cà chua"**, file ghi âm → ASR → trích xuất → lưu DRAFT/VOICE, thiếu file 400, phụ huynh 403 |
| 6. Duyệt | 2 | duyệt 16/16, lịch sử ghi nhận |
| 7. Phụ huynh & camera | 6 | timeline + ảnh, chặn xem con người khác, **trong khung giờ: LIVE + URL HLS**, **ngoài khung giờ: không URL + 403**, phụ huynh lớp khác 403, giờ đóng < giờ mở 400 |
| 8. Dashboard & báo cáo | 10 | KPI khớp số liệu báo cáo, phân bố bữa ăn = tổng bữa ăn, 4 loại báo cáo, **PDF thật (có font DejaVu)**, **Excel đọc lại có số dòng = bảng báo cáo**, tên file có khoảng ngày |
| 9. Quản lý | 5 | tạo giáo viên, trùng SĐT 409, khoá tài khoản thu hồi token ngay, tạo học sinh + phụ huynh (N-N), xoá lớp còn học sinh 409, dashboard quản trị |
| 10. Giới hạn tần suất | 1 | vượt giới hạn đăng nhập → **429 + Retry-After** |

**Xử lý Rate Limit (429):** bộ test đăng nhập ~20 lần, vượt giới hạn thật 10 lần/phút. Giới hạn đăng nhập nay đọc từ biến
`LOGIN_RATE_LIMIT` tại thời điểm request (mặc định 10). Khi chạy test, `test/env.ts` đặt 1000 để không bị chặn,
và test cuối cùng hạ xuống 1 để **xác nhận cơ chế 429 vẫn hoạt động**. Production không bị ảnh hưởng.

## 3. Kiểm thử tích hợp trên trình duyệt (FE ↔ BE)

Thực hiện trong trình duyệt tích hợp, origin riêng `qa.localhost:5173` để không ghi đè phiên đăng nhập của người dùng.

| # | Kịch bản | Kết quả |
|---|---|---|
| A1 | Đăng nhập System Admin qua form → `/admin`, JWT (role SYSTEM_ADMIN) trong localStorage | PASS |
| A2 | Đăng nhập Principal → `/principal` | PASS |
| A3 | Đăng nhập Teacher, **bỏ "Remember me"** → JWT chỉ nằm trong sessionStorage | PASS |
| A4 | Đăng nhập Parent → `/parent` | PASS |
| A5 | Gắn JWT đã hết hạn (ký bằng secret thật) rồi tải lại → FE xoá phiên, chuyển về `/login` | PASS |
| T1 | Mẫu chung + 3 ngoại lệ (sốt 37,9°C / vắng / ngủ 40 phút) → lưu nháp: 16 bé, 3 ngoại lệ, cảnh báo sốt + dị ứng; dữ liệu trong DB khớp từng trường | PASS (phát hiện B3) |
| T2 | Ghi âm (micro giả lập bằng Web Audio) → MediaRecorder → `ai/voice` → bản nháp AI gộp vào form, hiện transcript + bản ghi | PASS (phát hiện B1) |
| T3 | Approve & Publish → tự lưu phần chưa lưu rồi duyệt 16/16 | PASS |
| P1 | Sổ liên lạc: lịch đánh dấu 11 ngày, timeline đúng thứ tự giờ | PASS sau khi sửa B1 |
| P2 | Camera trong khung giờ: hls.js tải manifest, đổi chất lượng thích ứng, tải segment `.ts`, video chạy | PASS (phát hiện B4) |
| P3 | Camera ngoài khung giờ (lớp 2, 14:00–15:30): không có trình phát, URL không xuất hiện trong trang | PASS |
| D1 | KPI Dashboard so với SQL trực tiếp: chuyên cần 98,1%, dinh dưỡng 80, 20 cảnh báo sức khoẻ, tỷ lệ nộp 80,6% | PASS |
| D2 | Biểu đồ Recharts: 2 chuỗi × 5 ngày = 10 điểm; cột bữa ăn 72/41/34/5/0 = SQL | PASS |
| D3 | Xuất PDF/Excel cả 4 loại: `%PDF` / ZIP `PK`, đúng content-type | PASS (phát hiện B5) |
| — | Console trình duyệt: không có lỗi React | PASS |

## 4. Lỗi phát hiện và đã sửa

| Mã | Mức độ | Mô tả | Cách sửa | Kiểm chứng |
|---|---|---|---|---|
| B1 | **Cao** | Bộ trích xuất AI offline hiểu "thịt viên **sốt** cà chua" (nước sốt) là "**sốt**" (bệnh) → cả lớp bị gán *Không khỏe*, Dashboard báo 16 ca sức khoẻ trong 1 ngày | Bỏ các cụm "sốt" đứng sau tên món/nguyên liệu hoặc trước tên nước sốt trước khi áp luật sức khoẻ (`rule-based.extractor.ts`) | Test hồi quy E2E; "sốt 38 độ" vẫn nhận đúng là bệnh |
| B2 | Trung bình | E2E hiện có không chạy được bằng `npm run test:e2e` (script tạm ngoài repo); chạy liên tiếp bị 429 | Thêm bộ Jest/Supertest chính thức + `LOGIN_RATE_LIMIT` | 59/59 |
| B3 | Thấp | Bé vắng kế thừa `healthStatus = NORMAL` của lớp (giáo viên không quan sát được) | Bé vắng: bỏ NORMAL, giữ MONITOR/SICK (`journal-fields.ts`) | Assertion trong test bulk |
| B4 | Thấp | Video camera không tự phát nếu sẵn sàng lúc tab đang ẩn, và không thử lại khi quay lại tab | Thử phát lại khi tab hiện lên (`Camera.jsx`) | Kiểm tra thủ công |
| B5 | Thấp | Tên file xuất là `kinderlog-health-_today.pdf` khi API không nhận `from/to` | Dùng khoảng ngày đã tính (`reports.controller.ts`) | Assertion trong test PDF |
| — | Thấp | FE chưa có ESLint/Prettier; build cảnh báo chunk > 500 kB; 1 import thừa | Thêm ESLint + Prettier cho FE; tải hls.js (bản light) theo kiểu động; nâng ngưỡng chunk cho Recharts | lint/build sạch |

## 5. Cảnh báo còn tồn tại (không chặn build / demo)

| Mã | Nội dung | Ảnh hưởng | Đề xuất |
|---|---|---|---|
| W1 | **Không có refresh token**: JWT sống 8 giờ, hết hạn thì FE đăng xuất và yêu cầu đăng nhập lại | Người dùng phải đăng nhập lại sau 8 giờ | Thêm `POST /auth/refresh` + refresh token lưu httpOnly cookie, FE tự gọi khi gặp 401 |
| W2 | `pg` DeprecationWarning "client.query() when the client is already executing a query" phát sinh trong nội bộ TypeORM 0.3 (`loadRelationCountAndMap`). Hai chỗ ghi trong transaction của nhật ký đã được tuần tự hoá | Không ảnh hưởng dữ liệu với `pg` 8; `pg` 9 sẽ báo lỗi | Theo dõi bản sửa của TypeORM; không nâng `pg` lên 9 trước đó |
| W3 | 24 cảnh báo `react-refresh/only-export-components` (file vừa export component vừa export hàm/hằng, nhất là `store.jsx`) | Chỉ làm Vite tải lại toàn trang thay vì hot-reload khi dev | Tách hằng/hàm dùng chung ra file `.js` riêng khi có thời gian |
| — | Micro thật chưa được thử (khung trình duyệt tích hợp chặn quyền micro; đã dùng micro giả lập) | — | Thử một lần trên Chrome/Edge thật trước buổi bảo vệ |
| — | Mỗi lần chạy E2E để lại 1 ảnh test trong `BE/uploads/photos` | Rác nhỏ trong thư mục upload (đã gitignore) | Xoá định kỳ hoặc thêm bước dọn trong test |

## 6. Cách chạy lại

```bash
docker compose -f BE/docker-compose.yml up -d
cd BE && npm run test:e2e        # reseed DB + 59 test (dùng DB trong .env)
cd BE && npm run lint && npm run format:check && npm run build
cd FE && npm run lint && npm run format:check && npm run build
```

> Lưu ý: `test:e2e` seed lại database trong `.env` — chạy `npm run seed` sau đó nếu cần dữ liệu demo nguyên bản.
