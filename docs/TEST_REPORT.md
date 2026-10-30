# Báo cáo kiểm thử tích hợp hệ thống — PDJRS (KinderLog)

Ngày kiểm thử: 14–15/10/2026, chạy lại sau khi chuyển sang SQL Server ngày 18/10/2026 · Môi trường: Windows 11, Node.js 24,
SQL Server 2022 + Redis 7 (Docker), `AI_MODE=mock`
Phạm vi: Backend NestJS (`BE/`), Frontend React + Vite (`FE/`), tích hợp FE ↔ BE qua proxy Vite.

## 1. Tổng hợp

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| BE E2E (`npm run test:e2e`) | **PASS — 119/119** | 59 nghiệp vụ + 13 khởi tạo từ DB trống + 20 phân hệ phụ trợ + 16 luồng Admin + 11 luồng Hiệu trưởng; chạy trên database riêng `kinderlog_test` |
| BE TypeScript (`tsc --noEmit`) | **PASS** | 0 lỗi |
| BE ESLint (`npm run lint`, src + test) | **PASS** | 0 lỗi, 0 cảnh báo |
| BE Prettier (`npm run format:check`) | **PASS** | |
| BE build (`npm run build`) | **PASS** | |
| FE ESLint (`npm run lint`) | **PASS / WARNING** | 0 lỗi, 17 cảnh báo `react-refresh/only-export-components` (chỉ ảnh hưởng hot-reload khi dev) |
| FE Prettier (`npm run format:check`) | **PASS** | sau khi thêm cấu hình và định dạng lại |
| FE build (`npm run build`) | **PASS** | không còn cảnh báo kích thước chunk |
| Kiểm thử tích hợp trên trình duyệt (16 kịch bản) | **PASS 16/16** sau khi sửa lỗi | 5 lỗi phát hiện, đã sửa cả 5 |
| Cảnh báo còn tồn tại | **2 WARNING** | xem mục 5 |

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
| B6 | Trung bình | (SQL Server) Cột `time` của camera lưu kèm giây/mili-giây lúc ghi (`00:00:08.071`) do driver TypeORM chỉ đặt giờ/phút | Transformer `exactTime` trong `camera-stream.entity.ts` | Kiểm tra trực tiếp trong DB: `00:00:00`, `14:00:00` |
| B7 | Thấp | Nhật ký ghi vào thứ 7/CN có trong bảng báo cáo nhưng không được Dashboard tính (KPI chuyên cần lệch 97,8 % ↔ 98,7 %) | Dashboard tính cả ngày cuối tuần có dữ liệu (`reports.service.ts`) | Test "chart figures match the report rows" chạy vào Chủ nhật |
| B8 | Thấp | Mỗi lần chạy E2E để lại 1 ảnh test trong `BE/uploads/photos` | `afterAll` xoá ảnh vừa upload | Thư mục trống sau khi chạy |
| — | Thấp | FE chưa có ESLint/Prettier; build cảnh báo chunk > 500 kB; 1 import thừa | Thêm ESLint + Prettier cho FE; tải hls.js (bản light) theo kiểu động; nâng ngưỡng chunk cho Recharts | lint/build sạch |

## 5. Cảnh báo còn tồn tại (không chặn build / demo)

| Mã | Nội dung | Ảnh hưởng | Đề xuất |
|---|---|---|---|
| W1 | **Không có refresh token**: JWT sống 8 giờ, hết hạn thì FE đăng xuất và yêu cầu đăng nhập lại | Người dùng phải đăng nhập lại sau 8 giờ | Thêm `POST /auth/refresh` + refresh token lưu httpOnly cookie, FE tự gọi khi gặp 401 |
| W2 | 17 cảnh báo `react-refresh/only-export-components` (file vừa export component vừa export hàm/hằng, nhất là `store.jsx`) | Chỉ làm Vite tải lại toàn trang thay vì hot-reload khi dev | Tách hằng/hàm dùng chung ra file `.js` riêng khi có thời gian |
| — | Micro thật chưa được thử (khung trình duyệt tích hợp chặn quyền micro; đã dùng micro giả lập) | — | Thử một lần trên Chrome/Edge thật trước buổi bảo vệ |

## 6. Chuyển đổi PostgreSQL → SQL Server (18/10/2026)

| Hạng mục | Thay đổi |
|---|---|
| Hạ tầng | `docker-compose.yml`: SQL Server 2022 (Developer) thay PostgreSQL 16, bỏ Adminer; driver `mssql` thay `pg` |
| Schema | Migration mới `1792318915446-InitialSchema`: `nvarchar`/`nvarchar(MAX)`, enum → `CHECK`, `uniqueidentifier`, `datetime2`; FK cascade chỉ giữ ở quan hệ sở hữu (5), còn lại `NO ACTION` (8) |
| Truy vấn | `COUNT(*) FILTER` → `SUM(CASE…)`, `to_char` → `CONVERT(…, 23)`, `unaccent`/`ILIKE` → collation `_CI_AI`; mã lỗi 2627/2601/547 → 409 |
| Seed | `DELETE` theo thứ tự FK thay `TRUNCATE … CASCADE`; ghi theo lô 50 dòng (giới hạn 2100 tham số) |
| Dọn mã | FE: bỏ mock `cameras/schedules/attendance/journals` và các hàm/selector không còn dùng (`JournalTimeline`, `cameraState`, `downloadCSV`, …) — đã có API thật; giữ mock cho chat, thông báo, năm học, nhật ký hệ thống. Giao diện không đổi |
| Kết quả | E2E 59/59, tsc/lint/build BE và lint/build FE đều đạt |

## 7. Chuẩn bị vận hành thật — gỡ dữ liệu demo (20/10/2026)

| Hạng mục | Thay đổi |
|---|---|
| Database | Bỏ `npm run seed`. `npm run db:seed:admin` tạo System Admin đầu tiên từ `.env` (`ADMIN_PHONE`, `ADMIN_PASSWORD` ≥ 10 ký tự có chữ và số); `npm run db:clean -- --yes` xoá toàn bộ dữ liệu + ảnh rồi tạo lại Admin. Database `kinderlog` đã được làm sạch: 1 tài khoản Admin, mọi bảng khác 0 dòng, `uploads/photos` trống |
| Test | Dữ liệu mẫu chỉ còn là fixture của test (`BE/test/fixtures/demo-data.ts`). E2E chạy trên `<DB_NAME>_test`, upload vào thư mục tạm, Redis DB 1 — không đụng dữ liệu thật. Bộ mới `zero-state.e2e-spec.ts` (13 test): Admin trên hệ thống trống → tạo trường, hiệu trưởng, giáo viên, lớp, học sinh, phụ huynh; mọi dashboard/báo cáo/xuất file không có NaN/Infinity |
| AI | `AI_MODE=live` mặc định. Thiếu `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` → `503` "AI journal drafts are not set up yet…" thay cho bản nháp giả; `/health` và trang Giám sát báo "Not configured". `mock` chỉ dùng trong test |
| FE | Mock (`store/seed.js`) thay bằng `store/localData.js` rỗng; bỏ "Fill in" tài khoản demo ở trang đăng nhập, "Reset demo data" trong Cài đặt, ảnh minh hoạ `demo:`; trang Quên mật khẩu không còn lộ mật khẩu ban đầu. Trang Giám sát dùng số đo thật (`GET /api/system/metrics`: CPU, RAM, ổ đĩa, số/dung lượng ảnh, dung lượng DB) thay cho số liệu mẫu |

Lỗi phát hiện khi kiểm thử trạng thái trống và đã sửa:

| Mã | Mức độ | Mô tả | Cách sửa |
|---|---|---|---|
| B9 | **Cao** | Giáo viên chưa có lớp / phụ huynh chưa có con gọi `GET /classes`, `GET /students` → SQL `IN ()` lỗi cú pháp (500) | Danh sách rỗng → điều kiện `1=0` (`classes.service.ts`, `students.service.ts`) |
| B10 | **Cao** | Trang Nhật ký của giáo viên trắng xoá (`reading 'logged'`) khi giáo viên được phân lớp sau lần đăng nhập | Truy vấn trả `undefined` (đang tải) thay vì `null` khi chưa có lớp/con (9 chỗ trong `teacher.jsx`, `parent.jsx`) |
| B11 | Trung bình | Dashboard (cache Redis 60 s) không cập nhật sau khi tạo trường/lớp/học sinh/tài khoản; `dash:admin` không bao giờ bị xoá | `DashboardCacheInterceptor`: mọi request ghi thành công xoá cache dashboard |
| B12 | Thấp | Thiếu thông báo trống: biểu đồ/tổng quan trường (Admin), bảng lớp và camera (Hiệu trưởng), danh sách năm học, hoạt động gần đây; Năm học đếm lớp từ mock | Thêm EmptyState / dòng chú thích; đếm lớp theo API |

Kiểm tra trên trình duyệt (DB xác minh riêng, đã xoá sau khi kiểm tra): 6 màn hình Admin, 13 màn hình Hiệu trưởng,
6 màn hình Giáo viên (chưa có lớp và đã có lớp), 6 màn hình Phụ huynh (chưa liên kết con) — không lỗi console.

## 8. Phân hệ phụ trợ ở Backend (20/10/2026)

Năm bảng mới (migration `1792491558421-AuxiliaryModules`, chỉ tạo bảng, không đổi bảng cũ): `academic_years`,
`school_announcements`, `notifications`, `messages`, `audit_logs` — kèm module NestJS, phân quyền JWT + Roles và
phân trang `{ items, total, page, limit, pages }`. Chi tiết API: `BE/README.md` mục 3.

| Bộ test `collaboration.e2e-spec.ts` (20 test) | Nội dung kiểm tra |
|---|---|
| Năm học (5) | tạo/sửa/xoá, trùng tên 409, tên/ngày sai 400, chỉ một năm ACTIVE, giáo viên chỉ đọc, trường khác 404, năm còn lớp không xoá/đổi tên được, trường mới có sẵn năm học hiện tại |
| Thông báo trường (3) | nháp ẩn với phụ huynh, đăng → hiện + tạo thông báo đúng đối tượng, hết hạn bị ẩn, phân trang + lọc + tìm không dấu, giáo viên 403, trường khác 404 |
| Tin nhắn (5) | danh bạ theo quan hệ thật, 6 trường hợp bị từ chối (403), số chưa đọc, gộp thông báo, hội thoại phân trang mới nhất trước, đánh dấu đã đọc, chỉ người gửi sửa (khi chưa đọc) / xoá |
| Thông báo (2) | Hiệu trưởng gửi theo vai trò (chỉ tài khoản ACTIVE của trường), không gửi sang trường khác; chỉ đọc/đánh dấu/xoá được của mình |
| Nhật ký hệ thống (5) | đăng nhập sai được ghi (không lộ mật khẩu), người thao tác + IP + kết quả, không ghi nội dung tin nhắn, lọc + phân trang, cách ly trường, GV/PH 403, xoá tài khoản giữ log + xoá tin nhắn, Admin dọn log cũ |

Kết quả: **92/92** (59 cũ + 13 khởi tạo + 20 mới); lint, Prettier, `tsc`, build đạt. Migration đã chạy trên `kinderlog`.

### FE dùng API mới (20/10/2026)

Các trang Tin nhắn, Thông báo, Thông báo trường (Hiệu trưởng + Phụ huynh), Năm học, Nhật ký hệ thống, "Hoạt động gần
đây" trên Dashboard và các badge chưa đọc đọc/ghi qua API; `localStorage` chỉ còn giữ Cài đặt hệ thống. FE: lint 0 lỗi,
Prettier, build đạt.

Kiểm thử trên trình duyệt (database xác minh riêng, đã xoá sau khi kiểm tra), hai tab với hai phiên độc lập:

| Kịch bản | Kết quả |
|---|---|
| Giáo viên gửi tin cho phụ huynh | Lưu vào `messages` (SQL Server) + thông báo MESSAGE cho phụ huynh |
| Phụ huynh đăng nhập ở tab khác | Badge Messages 1 / Notifications 1; thấy đúng tin, dòng phụ "Teacher · Mặt Trời 1" |
| Phụ huynh trả lời | Tab giáo viên tự hiện câu trả lời sau ≤ 5 s, không tải lại trang; badge phụ huynh về 0 |
| Hiệu trưởng tạo năm học "2026–2027" (Current) | Lưu `2026-2027` ACTIVE; đếm đúng 2 lớp |
| Hiệu trưởng đăng thông báo cho phụ huynh | Phụ huynh thấy ở trang chủ + trang Thông báo trường + 1 thông báo; bấm vào → đánh dấu đã đọc (`read_at`), badge giảm |
| Nhật ký (Hiệu trưởng, Admin) | Đủ đăng nhập / tạo năm học / tạo thông báo với người thao tác; lọc theo vai trò chạy phía server; không ghi tin nhắn |

Sửa thêm ở BE: mở hội thoại cũng đánh dấu đã đọc thông báo "tin nhắn mới" của người đó (test bổ sung; vẫn 92/92).

## 9. Rà soát luồng Quản trị viên (21/10/2026)

Bộ `admin.e2e-spec.ts` (16 test): Dashboard khớp dữ liệu và làm mới ngay sau thao tác ghi; trường học tạo / sửa / xem /
xoá (trường mới có năm học ACTIVE, trường rỗng xoá kèm năm học); tài khoản Hiệu trưởng tạo / trùng số / reset mật khẩu /
khoá – mở khoá / xoá (thông báo và nhật ký được giữ); `/health`, `/system/metrics`; nhật ký lọc theo ngày, hành động,
trạng thái, phân trang, kết quả rỗng, tham số sai (400) và dọn log cũ.

| Mã | Mức độ | Vấn đề | Cách sửa |
|---|---|---|---|
| B13 | **Cao** | Khoá / tạm ngưng **trường** không cắt phiên đang mở: nhân viên vẫn dùng token tới khi hết hạn (8 giờ), trái với thông báo "Access will be blocked immediately" | `JwtStrategy` kiểm tra cả trạng thái trường mỗi request → 401, FE tự đăng xuất |
| B14 | Trung bình | Sửa tên trường không kiểm tra trùng (lúc tạo thì có) | 409 "A school with this name already exists" |
| B15 | Thấp | Xoá trường còn tài khoản / lớp trả thông báo chung từ khoá ngoại SQL Server | Kiểm tra trước, 409 nêu số tài khoản và số lớp còn lại |

Không tìm thấy `IN ()` rỗng hay chia cho 0 trong các truy vấn Admin. Giao diện không đổi. FE không có nút xoá trường /
Hiệu trưởng (chỉ Kích hoạt / Tạm ngưng / Khoá / Reset mật khẩu) nên xoá được kiểm tra ở mức API; dọn log cũ cũng chỉ có qua
API (`DELETE /api/audit-logs?before=`).

## 10. Rà soát phân hệ Hiệu trưởng (22/10/2026)

Bộ `principal.e2e-spec.ts` (11 test): số liệu Dashboard khớp dữ liệu; "Unread Messages" chỉ tính hộp thư của Hiệu
trưởng (không đọc được tin GV ↔ PH); năm học "2026-2027"; lớp học tạo / sửa / trùng tên / GVCN khác trường / xoá;
tài khoản giáo viên tạo / reset mật khẩu / khoá; học sinh nhận mọi ngày sinh hợp lệ, chuyển lớp trong trường, xoá kèm
nhật ký; thông báo trường do server ghi ngày đăng; danh bạ tin nhắn; mở hội thoại xoá thông báo tin nhắn; cách ly
dữ liệu giữa hai trường (403 cho lớp / học sinh / tài khoản / báo cáo của trường khác).

| Mã | Mức độ | Vấn đề | Cách sửa |
|---|---|---|---|
| B16 | Trung bình | Thêm học sinh + phụ huynh mới (hoặc phụ huynh + học sinh mới): nếu bước thứ hai lỗi, tài khoản phụ huynh vừa tạo vẫn còn → lưu lại báo "số điện thoại đã dùng" | FE xoá tài khoản phụ huynh vừa tạo khi bước sau lỗi (chỉ logic, giao diện không đổi) |
| B17 | Thấp | Xoá lớp không còn học sinh nhưng còn nhật ký cũ → lỗi khoá ngoại chung chung | 409 nêu số học sinh / số nhật ký, gợi ý tạm ngưng lớp |
| B18 | Thấp | Trùng tên lớp trong cùng năm học → "A record with the same unique value already exists" | 409 "A class named … already exists in 2026-2027" |

Trình duyệt (DB test): 14 trang Hiệu trưởng tải không lỗi console; ô Age Group là ô nhập chữ; form thông báo không có
ô Publish Date. Ghi nhận: FE chưa có trang Tin nhắn / Thông báo cho Hiệu trưởng (API đã hỗ trợ) — thêm trang là thay
đổi giao diện nên chưa làm.

## 11. Cách chạy lại

```bash
docker compose -f BE/docker-compose.yml up -d
cd BE && npm run migration:run  # tạo database + bảng (lần đầu)
cd BE && npm run test:e2e        # 119 test trên database kinderlog_test (tự tạo + migrate)
cd BE && npm run lint && npm run format:check && npm run build
cd FE && npm run lint && npm run format:check && npm run build
```

> `test:e2e` không đụng database `kinderlog` đang dùng.
