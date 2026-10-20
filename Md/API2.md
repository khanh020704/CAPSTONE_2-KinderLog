# KinderLog — API phân hệ Giáo viên

Tài liệu này lọc từ [API.md](API.md) những API mà vai trò Giáo viên dùng, sắp theo 8 chức năng PB09–PB17 của tài liệu BE Specs.

> **Trạng thái:** đã cài đặt trong `BE/` (Express + SQL Server). Nội dung bám theo hành vi của frontend hiện có (`FE/src/pages/teacher.jsx`, `FE/src/components/Chat.jsx`); những chỗ khác với BE Specs được ghi ở cuối mỗi mục và tổng hợp ở [mục 11](#11-chỗ-lệch-với-be-specs).
>
> Bản cài đặt khác tài liệu này ở năm điểm:
>
> - **ID** là số thứ tự dòng trong SQL Server, gửi dưới dạng chuỗi (ví dụ `"12"`), không phải dạng `c1`, `st1` trong các ví dụ.
> - **Đăng nhập** nhận `phone` hoặc `username`; `role` là tùy chọn.
> - **`POST /journals/voice-draft`** nhận bản ghi âm (`audio`) và/hoặc `transcript`. Khi có `GROQ_API_KEY`, server chuyển giọng nói thành chữ bằng Whisper, có gợi ý tên học sinh của lớp; văn bản của trình duyệt chỉ là dự phòng. LLM chuyển lời nói tự do thành các mục có cấu trúc, rồi code đối chiếu tên với danh sách lớp, tìm mâu thuẫn và thông tin sức khỏe bất thường. Kết quả trả thêm `transcriptSource`, `entries`, `issues` và `engine`. Câu có tên không khớp chính xác, hoặc nói về một bé không rõ tên, bị giữ trong `issues` (`held: true`) và không vào nhật ký cho tới khi giáo viên quyết định; `POST /journals/:id/approve` trả 422 `REVIEW_PENDING` khi còn điểm chưa xác nhận. Không có khóa thì dùng bộ từ khóa (`engine: "keywords"`), vẫn qua cùng bước kiểm tra.
> - **Điểm danh** nhận thêm `late` và `excused` ngoài `present`, `absent`.
> - **Tệp tải lên** được phục vụ công khai tại `/uploads/<tên ngẫu nhiên>`, chưa kiểm tra quyền xem. **Email đặt lại mật khẩu** chưa được gửi thật: liên kết được in ra log của server.

## Mục lục

1. [Quy ước chung](#1-quy-ước-chung)
2. [Bảng đối chiếu PB ↔ API](#2-bảng-đối-chiếu-pb--api)
3. [PB09 — Danh sách học sinh và phụ huynh](#3-pb09--danh-sách-học-sinh-và-phụ-huynh)
4. [PB11 — Điểm danh hằng ngày](#4-pb11--điểm-danh-hằng-ngày)
5. [Nhật ký: đối tượng và vòng đời](#5-nhật-ký-đối-tượng-và-vòng-đời)
6. [PB12, PB13, PB15 — Soạn nội dung nhật ký](#6-pb12-pb13-pb15--soạn-nội-dung-nhật-ký)
7. [PB14 — Ghi âm và xử lý AI](#7-pb14--ghi-âm-và-xử-lý-ai)
8. [PB16 — Xem lại, đính kèm ảnh, xuất bản](#8-pb16--xem-lại-đính-kèm-ảnh-xuất-bản)
9. [PB17 — Trao đổi với phụ huynh](#9-pb17--trao-đổi-với-phụ-huynh)
10. [API hỗ trợ ngoài 8 PB](#10-api-hỗ-trợ-ngoài-8-pb)
11. [Chỗ lệch với BE Specs](#11-chỗ-lệch-với-be-specs)

---

## 1. Quy ước chung

| Mục | Giá trị |
| --- | --- |
| Base URL | `/api/v1` |
| Xác thực | `Authorization: Bearer <accessToken>`, `role = teacher` |
| Content-Type | `application/json; charset=utf-8` (upload: `multipart/form-data`) |
| Ngày | `YYYY-MM-DD` |
| Thời điểm | Số nguyên, epoch mili giây |
| ID | Chuỗi, do server sinh |

**Phạm vi dữ liệu.** Một giáo viên chủ nhiệm tối đa một lớp. Mọi API bên dưới chỉ cho phép thao tác trên lớp đó; lớp được xác định từ token, không tin `classId` do client gửi. Truy cập lớp khác: **403** `FORBIDDEN`. Giáo viên chưa được phân lớp: các API theo lớp trả **404** `NO_CLASS`, UI hiển thị "You have not been assigned to a class yet."

**Định dạng lỗi.**

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Add content to at least one section before approving.",
    "fields": {}
  }
}
```

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Thiếu trường bắt buộc, sai định dạng |
| 401 | `UNAUTHENTICATED` | Thiếu token, token hết hạn |
| 403 | `FORBIDDEN` | Sai vai trò hoặc ngoài lớp mình |
| 404 | `NOT_FOUND` | Không có tài nguyên |
| 409 | `CONFLICT` và mã cụ thể | Vi phạm ràng buộc duy nhất |
| 422 | `INVALID_STATE` | Thao tác không hợp lệ với trạng thái hiện tại |

`message` là câu frontend hiển thị trực tiếp.

---

## 2. Bảng đối chiếu PB ↔ API

| PB | Chức năng | Method | Đường dẫn |
| --- | --- | --- | --- |
| PB09 | Danh sách học sinh và phụ huynh | GET | `/teacher/class` |
| PB11 | Điểm danh | GET | `/attendance?classId&date` |
| | | PUT | `/attendance` |
| PB12 | Trạng thái chung cả lớp | PUT | `/journals/{id}` — phần `sections` |
| PB13 | Ngoại lệ từng học sinh | PUT | `/journals/{id}` — phần `personal` |
| PB14 | Ghi âm và xử lý AI | POST | `/journals/voice-draft` |
| | | POST | `/journals/{id}/recordings` |
| PB15 | Nhập nhật ký thủ công | POST | `/journals` |
| | | PUT | `/journals/{id}` |
| PB16 | Xem lại, ảnh, xuất bản | GET | `/journals` |
| | | GET | `/journals/{id}` |
| | | POST | `/uploads` |
| | | POST | `/journals/{id}/approve` |
| | | POST | `/journals/{id}/publish` |
| PB17 | Trao đổi với phụ huynh | GET | `/conversations` |
| | | GET | `/conversations/unread-count` |
| | | GET, POST | `/conversations/{peerId}/messages` |
| | | POST | `/conversations/{peerId}/read` |

---

## 3. PB09 — Danh sách học sinh và phụ huynh

### `GET /teacher/class`

Trả lớp chủ nhiệm cùng danh sách học sinh. Danh sách chỉ đọc: học sinh do hiệu trưởng thêm, sửa, xóa.

**200**

```json
{
  "class": { "id": "c1", "name": "Mặt Trời 1" },
  "students": [
    {
      "id": "st1",
      "name": "Nguyễn Minh An",
      "dob": "2022-03-14",
      "gender": "Male",
      "photo": "",
      "note": "",
      "today": "present",
      "parents": [
        { "name": "Nguyễn Thị Hương", "phone": "0904000001", "relationship": "Mother" }
      ]
    }
  ]
}
```

| Trường | Ghi chú |
| --- | --- |
| `students` | Chỉ học sinh `status = Active` của lớp |
| `gender` | `Male` \| `Female` |
| `note` | Ghi chú của hiệu trưởng cho giáo viên: dị ứng, người đón… |
| `today` | Điểm danh hôm nay của bé: `present` \| `absent` \| `null` (chưa điểm danh) |
| `parents` | Chỉ các liên kết phụ huynh–con đang `Active` |
| `relationship` | `Mother` \| `Father` \| `Grandmother` \| `Grandfather` \| `Guardian` |

Tìm kiếm theo tên bé đang được làm trên trình duyệt (không phân biệt hoa thường và dấu tiếng Việt), nên endpoint không cần tham số `q`.

> **Khác BE Specs:** BE Specs tách `GET /teacher/classes/{classId}/students` và `GET /teacher/students/{studentId}`. Ở đây gộp một lần gọi vì giáo viên chỉ có một lớp (khoảng 15–16 bé) và màn hình chi tiết chỉ cần đúng các trường trên.

---

## 4. PB11 — Điểm danh hằng ngày

Mỗi (lớp, ngày) có tối đa một bảng điểm danh.

### Đối tượng

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
| `records` | Map `studentId → { status, note }`. Bé chưa được đánh dấu thì không có khóa |
| `status` | `present` \| `absent` |
| `note` | Tùy chọn: lý do nghỉ, hoặc ghi chú như "đến muộn" |
| `counts.total` | Số học sinh `Active` của lớp |
| `counts.unrecorded` | `total - present - absent`, không âm |
| `counts.recorded` | `false` khi ngày đó chưa có bảng điểm danh |

### `GET /attendance?classId={id}&date={YYYY-MM-DD}`

Chưa có bảng cho ngày đó: vẫn trả **200** với `records = {}`, `savedAt = null`, `counts.recorded = false`.

### `PUT /attendance`

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
- Mọi `studentId` phải thuộc lớp.

**200** trả đối tượng đã lưu.

Tác dụng phụ: ghi audit `Update` / `Attendance` / `Attendance saved: {tên lớp}`.

Nút "Mark all present" của UI chỉ điền sẵn form trên trình duyệt rồi gọi `PUT` này; không cần endpoint riêng.

> **Khác BE Specs:**
> - BE Specs có 4 trạng thái `PRESENT`, `ABSENT_EXCUSED`, `ABSENT_UNEXCUSED`, `LATE`. Frontend chỉ có `present` và `absent`; có phép hay không và đi trễ đang được ghi trong `note`.
> - BE Specs dùng `POST /teacher/attendance`. Ở đây dùng `PUT` vì thao tác là ghi đè, gọi lại nhiều lần cho cùng kết quả.
> - BE Specs có `GET /teacher/attendance/summary`. Ở đây thống kê nằm trong `counts` của `GET /attendance` và trong `GET /teacher/dashboard`.

---

## 5. Nhật ký: đối tượng và vòng đời

Phần này dùng chung cho PB12–PB16.

Nguyên tắc: **AI gợi ý → giáo viên kiểm tra → giáo viên quyết định.** Không có gì tới phụ huynh nếu giáo viên chưa duyệt và bấm xuất bản.

### 5.1 Đối tượng `Journal`

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
  "photos": ["https://…/j1-1.jpg"],
  "transcript": "Hôm nay các con ăn ngon miệng. …",
  "audio": ["https://…/j1-rec1.webm"],
  "updatedAt": 1791600000000,
  "publishedAt": 1791600000000,
  "revision": 1,
  "editedAt": null,
  "unpublishedChanges": false
}
```

| Trường | Ghi chú |
| --- | --- |
| `classId` + `date` | Duy nhất: mỗi lớp mỗi ngày một nhật ký. `date` không ở tương lai |
| `status` | `draft` \| `review` \| `approved` \| `published` |
| `source` | `manual` \| `voice`. Chuyển thành `voice` ngay khi có một lần ghi âm |
| `sections` | Sáu mục cố định, **chung cho cả lớp**. Mục trống là `""` |
| `personal` | Map `studentId → ghi chú riêng`, **chỉ phụ huynh của bé đó xem được**. Mục rỗng bị loại khi lưu |
| `photos` | Danh sách URL, tối đa `settings.maxPhotos` (mặc định 6) |
| `transcript`, `audio` | Văn bản và bản ghi âm gốc; chỉ giáo viên xem |
| `publishedAt` | `null` cho tới khi xuất bản; thời điểm xuất bản **lần đầu** |
| `revision` | Số lần xuất bản: `0` trước khi xuất bản, `1` sau lần đầu, +1 mỗi lần đăng lại một thay đổi |
| `editedAt` | Thời điểm đăng lại thay đổi gần nhất; `null` khi phụ huynh vẫn thấy bản đầu tiên |
| `unpublishedChanges` | `true` khi đã xuất bản rồi bị sửa mà chưa đăng lại: phụ huynh vẫn thấy bản đã xuất bản |

Sáu khóa của `sections`: `meal` (bữa ăn), `learning` (học tập), `sleep` (giấc ngủ), `health` (sức khỏe), `emotion` (cảm xúc), `note` (ghi chú chung cho phụ huynh cả lớp).

### 5.2 Vòng đời

```
manual:  (tạo) ──► draft ──────┐
                               ├──► approved ──► published
voice:   (tạo) ──► review ─────┘                     │
                     ▲                               │
                     └──── sửa nội dung / ghi âm thêm ┘   (cả sau khi duyệt và sau khi xuất bản)
```

| Chuyển trạng thái | Điều kiện |
| --- | --- |
| Tạo → `draft` | Viết tay |
| Tạo → `review` | Từ bản nháp giọng nói |
| `draft` / `review` → `approved` | Ít nhất một mục `sections` hoặc một ghi chú `personal` có nội dung |
| `approved` → `draft` / `review` | Tự động khi nội dung thay đổi sau khi duyệt: về `review` nếu `source = voice`, về `draft` nếu `manual` |
| Bất kỳ → `review` | Ghi âm thêm; nội dung mới được nối vào, không thay thế |
| `approved` → `published` | Chỉ từ `approved` |
| `published` → `draft` / `review` | Khi giáo viên sửa nội dung sau khi xuất bản. Phụ huynh vẫn thấy bản đã xuất bản cho tới khi duyệt và xuất bản lại ([mục 8](#sửa-nhật-ký-đã-xuất-bản)) |

Nhãn hiển thị: `draft` → Draft, `review` → Needs Review, `approved` → Approved, `published` → Published.

---

## 6. PB12, PB13, PB15 — Soạn nội dung nhật ký

Ba chức năng này dùng chung hai endpoint: tạo nhật ký cho một ngày, rồi lưu nội dung.

### `POST /journals` — tạo nhật ký (PB15)

```json
{ "date": "2026-10-11", "source": "manual" }
```

**201** trả `Journal` với `status = draft`, sáu mục `sections` rỗng, `personal = {}`, `photos = []`.

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 409 | `JOURNAL_EXISTS` | Lớp đã có nhật ký cho ngày đó |
| 400 | `VALIDATION_ERROR` | `date` ở tương lai |

Tạo từ giọng nói (`source = voice`) xem [mục 7](#7-pb14--ghi-âm-và-xử-lý-ai).

### `PUT /journals/{id}` — lưu nháp (PB12, PB13, PB15, PB16)

```json
{
  "sections": {
    "meal": "Các con ăn hết suất cơm với canh bí đỏ.",
    "learning": "Cả lớp học đếm số từ 1 đến 10.",
    "sleep": "Ngủ trưa khoảng 90 phút.",
    "health": "Sức khỏe ổn định.",
    "emotion": "Các con vui vẻ.",
    "note": ""
  },
  "personal": {
    "st9": "Bé Nam hơi ho, trưa ăn ít hơn mọi ngày.",
    "st4": "Bé Linh được cô khen vì tự xếp gối sau giờ ngủ."
  },
  "photos": ["https://…/a.jpg"]
}
```

- Thay toàn bộ `sections`, `personal`, `photos`.
- **PB12 — trạng thái chung cả lớp:** ghi vào `sections`. Một lần lưu áp dụng cho mọi học sinh của lớp, không cần gửi danh sách ID.
- **PB13 — ngoại lệ từng học sinh:** ghi vào `personal`. Khóa phải là học sinh `Active` của lớp. Bỏ một khóa khỏi map là xóa ghi chú của bé đó.
- Nhiều hơn `maxPhotos` ảnh: **400**.
- Nhật ký đang `approved` hoặc `published` mà nội dung khác bản đã lưu → trạng thái tự về `draft` / `review`. Nội dung không đổi thì giữ nguyên trạng thái.
- Nhật ký đã `published` vẫn sửa được; phụ huynh chỉ thấy thay đổi sau khi duyệt và xuất bản lại.

**200** trả `Journal` đã cập nhật.

**Cách phụ huynh nhìn thấy hai lớp dữ liệu này.** Khi phụ huynh mở nhật ký, server trả toàn bộ `sections` kèm đúng một ghi chú `personal` của con họ. Ghi chú riêng được hiển thị thêm bên dưới phần chung với nhãn "Only you can see this note"; nó bổ sung chứ không thay thế nội dung chung. Ghi chú về bé khác không bao giờ được trả cho phụ huynh.

> **Khác BE Specs:**
> - **PB12:** BE Specs có `POST /teacher/activities/bulk` lưu trạng thái ăn, ngủ, học cho từng học sinh theo danh sách ID. Frontend không lưu trạng thái theo từng bé: `sections` là văn bản chung của lớp, nên không có thao tác ghi hàng loạt.
> - **PB13:** BE Specs có `PATCH /teacher/journals/{journalId}/exceptions` và yêu cầu ngoại lệ **ghi đè** trạng thái chung khi truy vấn. Frontend dùng ghi chú văn bản tự do, hiển thị **kèm theo** phần chung.
> - **PB15:** BE Specs có `POST /teacher/journals/manual`. Ở đây nhật ký thủ công và nhật ký AI dùng chung `POST /journals` và `PUT /journals/{id}`, phân biệt bằng `source`.

---

## 7. PB14 — Ghi âm và xử lý AI

Chỉ dùng được khi `settings.aiJournal = true`. Nếu tắt: **403** `AI_DISABLED`, UI hiển thị "AI-assisted drafts are turned off by the system administrator."

### Luồng hai bước trên giao diện

1. `POST /journals/transcribe` (`multipart/form-data`: `audio`, và `transcript` của trình duyệt làm dự phòng) trả `{ transcript, transcriptSource, audioUrl }`. Bản ghi âm được lưu lại; Whisper dùng danh sách tên trong lớp làm gợi ý.
2. Giao diện hiện `transcript` trong một ô nhập. Giáo viên sửa tên và chữ nếu cần; **Enter** để gửi, **Shift+Enter** để xuống dòng.
3. `POST /journals/voice-draft` (JSON) với `transcript` là đoạn đã sửa, `audioUrl` lấy từ bước 1, `date` là ngày của nhật ký, và `journalId` khi ghi âm thêm. Server không chuyển giọng nói lần nữa (`transcriptSource = teacher`), mà bóc tách đoạn chữ đã sửa và kiểm tra lại: tên, mâu thuẫn, sức khỏe, đối chiếu điểm danh.

### `POST /journals/voice-draft` — chuyển bản ghi âm thành bản nháp

`multipart/form-data`:

| Phần | Kiểu | Ghi chú |
| --- | --- | --- |
| `audio` | file | Bản ghi âm. Trình duyệt gửi định dạng của `MediaRecorder`, thường là `audio/webm` |
| `classId` | string | Để lấy danh sách học sinh `Active` phục vụ nhận diện tên |

**200**

```json
{
  "transcript": "Hôm nay các con ăn ngon miệng. Bé An ngủ hơi muộn",
  "sections": {
    "meal": "Hôm nay các con ăn ngon miệng.",
    "learning": "",
    "sleep": "",
    "health": "",
    "emotion": "",
    "note": ""
  },
  "personal": { "st1": "Bé An ngủ hơi muộn." },
  "audioUrl": "https://…/rec1.webm"
}
```

Kết quả **chỉ là bản nháp**: endpoint này không lưu nhật ký và không xuất bản gì.

| HTTP | `code` | `message` |
| --- | --- | --- |
| 422 | `NO_SPEECH` | `We couldn't process the recording. No speech was detected. Please try again.` |
| 403 | `AI_DISABLED` | |
| 502 / 504 | `AI_UNAVAILABLE` | `We couldn't process the recording. Please try again.` |

Khi AI lỗi hoặc quá thời gian, giáo viên bấm "Retry" hoặc chuyển sang viết tay (PB15).

Quy tắc phân loại mà đầu ra phải tuân theo:

- **Câu nhắc tên một bé trong lớp** đi vào `personal` của bé đó, không vào phần chung. Nhận diện theo họ tên đầy đủ, hai từ cuối của tên ("Minh An"), hoặc dạng "bé An", "bạn An", "con An" khi trong lớp chỉ có một bé tên đó. "Các bạn Nam" không phải bé tên Nam.
- Các câu còn lại xếp theo chủ đề vào `meal`, `learning`, `sleep`, `health`, `emotion`; không khớp chủ đề nào thì vào `note`.
- Khóa của `personal` chỉ được là ID học sinh `Active` của lớp.

### Tạo nhật ký từ bản nháp giọng nói

Gọi `POST /journals` với kết quả ở trên:

```json
{
  "date": "2026-10-11",
  "source": "voice",
  "sections": { "meal": "…", "learning": "", "sleep": "", "health": "", "emotion": "", "note": "" },
  "personal": { "st1": "…" },
  "transcript": "…",
  "audio": ["https://…/rec1.webm"]
}
```

**201** trả `Journal` với `status = review`.

### `POST /journals/{id}/recordings` — ghi âm thêm

Dùng khi giáo viên quên nói điều gì đó, hoặc muốn nói thêm vào nhật ký đang viết tay. Thân request giống kết quả của `voice-draft`.

Server:

- nối từng mục `sections`, từng ghi chú `personal` và `transcript` vào nội dung hiện có (cách nhau một dấu cách) — **không thay thế**;
- thêm `audioUrl` vào `audio`;
- đặt `source = voice` và `status = review`.

**200** trả `Journal` đã cập nhật. Với nhật ký đã `published`, phần ghi thêm chỉ tới phụ huynh sau khi duyệt và xuất bản lại.

> **Khác BE Specs:**
> - BE Specs đặt endpoint là `POST /teacher/ai/process-voice` và nhận `.wav`, `.mp3`, `.m4a`. Trình duyệt ghi âm ra `audio/webm`, nên server cần nhận thêm định dạng này hoặc tự chuyển mã.
> - Frontend hiện chuyển giọng nói thành văn bản ngay trong trình duyệt (Web Speech API, `vi-VN`, chỉ chạy trên Chrome và Edge) và phân loại bằng từ khóa. Khi chuyển sang Whisper và LLM ở server như BE Specs, chỉ cần giữ nguyên hình dạng đầu ra ở trên là UI không phải sửa phần hiển thị.

---

## 8. PB16 — Xem lại, đính kèm ảnh, xuất bản

### `GET /journals` — lịch sử nhật ký của lớp

| Tham số | Ghi chú |
| --- | --- |
| `status` | `draft` \| `review` \| `published`. `review` gồm cả nhật ký đang `approved` (tab "Needs Review") |
| `date` | Lấy nhật ký của một ngày cụ thể |

Sắp xếp `date` giảm dần. Mỗi phần tử gồm `id`, `date`, `status`, `source`, `updatedAt`, `publishedAt`, `unpublishedChanges`.

### `GET /journals/{id}`

Trả `Journal` đầy đủ, gồm cả `personal`, `transcript`, `audio`.

### `POST /uploads` — tải ảnh

`multipart/form-data`:

| Phần | Ghi chú |
| --- | --- |
| `file` | Ảnh (`image/*`) |
| `purpose` | `journal-photo` |

**201**

```json
{ "url": "https://…/uploads/abc123.jpg", "contentType": "image/jpeg", "size": 482113 }
```

Sau khi tải lên, đưa `url` vào mảng `photos` và gọi `PUT /journals/{id}`. Giới hạn `maxPhotos` được kiểm tra ở bước `PUT`. Thêm hoặc bớt ảnh sau khi duyệt cũng làm nhật ký quay về `draft` / `review`.

Ảnh hoạt động là dữ liệu trẻ em: URL không nên công khai vĩnh viễn. Dùng URL có chữ ký, hoặc phục vụ qua endpoint có kiểm tra quyền (phụ huynh chỉ xem ảnh nhật ký của lớp con mình).

### `POST /journals/{id}/approve` — duyệt

Không có thân request; frontend lưu nội dung bằng `PUT` trước rồi mới gọi.

**200** trả `Journal` với `status = approved`.

| HTTP | `code` | `message` |
| --- | --- | --- |
| 422 | `INVALID_STATE` | `Add content to at least one section before approving.` |
| 422 | `REVIEW_PENDING` | Còn điểm cần xác nhận của bản nháp giọng nói |
| 422 | `INVALID_STATE` | `This journal is already published. Change it first, then approve the changes.` |

### `POST /journals/{id}/publish` — xuất bản

Không có thân request. **200** trả `Journal` với `status = published`, `publishedAt` là thời điểm xuất bản lần đầu, `revision` tăng 1.

Chỉ xuất bản được từ `approved`; các trạng thái khác: **422** `INVALID_STATE`.

Tác dụng phụ:

1. Thông báo cho mọi phụ huynh của lớp: `type = journal`, tiêu đề `New journal published`, nội dung `The daily journal for {lớp} is ready to view.`
2. Với mỗi bé có ghi chú riêng: thông báo cho từng phụ huynh có liên kết `Active` với bé đó — `A note about {tên bé}` / `The teacher wrote a personal note in today's journal.`
3. Audit: `Publish` / `Daily Journal` / `Journal published: {lớp}`.

Đăng lại một thay đổi có thông báo và audit riêng, xem bên dưới.

### Sửa nhật ký đã xuất bản

Giáo viên vẫn sửa được nhật ký đã `published` (nút **Edit Journal** ở màn xem nhật ký). Server giữ hai bản:

| Bản | Ai thấy | Lưu ở đâu |
| --- | --- | --- |
| Bản làm việc | Giáo viên (`GET /journals/{id}`) | Các cột nội dung của `class_daily_summaries`, `journal_photos` |
| Bản đã xuất bản | Phụ huynh (`GET /parent/journals…`) | `class_daily_summaries.publishedVersion`, chép lại mỗi lần publish |

1. `PUT /journals/{id}` (hoặc `POST /journals/{id}/recordings`) với nội dung khác → lưu ngay vào cơ sở dữ liệu, `status` về `draft` / `review`, `unpublishedChanges = true`. Nội dung không đổi thì vẫn `published`.
2. Trong lúc đó phụ huynh **vẫn thấy bản đã xuất bản**, không ai nhận thông báo.
3. `approve` → `publish` như bình thường. `publishedVersion` được thay bằng nội dung mới, `revision` tăng 1, `editedAt` là thời điểm đăng lại; `publishedAt` giữ thời điểm xuất bản lần đầu.
4. Cổng phụ huynh nhận bản mới ở lần làm mới kế tiếp (frontend hỏi lại mỗi 10 giây), không cần tải lại trang.
5. Chỉ báo cho phụ huynh liên quan:
   - mục chung hoặc ảnh thay đổi → mọi phụ huynh của lớp: `Journal updated` / `The teacher updated the journal of {ngày} for {lớp}.`
   - ghi chú riêng của bé được thêm, sửa hoặc xóa → chỉ phụ huynh của bé đó: `Note about {tên bé} updated` / `The teacher changed the personal note in the journal of {ngày}.`
   - không có gì khác so với bản đã xuất bản → không ai nhận thông báo.
6. Audit: `Update` / `Daily Journal` / `Published journal updated: {lớp}`.

Nhật ký xuất bản trước khi có chức năng này được migration `004-published-version` chép nội dung hiện tại thành bản đã xuất bản (`revision = 1`).

### Phụ huynh xem nhật ký

`role = parent`. `studentId` phải là bé có liên kết `Active` với phụ huynh đang gọi, nếu không: **403** `FORBIDDEN`.

`GET /parent/journals?studentId={id}&month=YYYY-MM` — nhật ký đã xuất bản của lớp bé, `date` giảm dần; `month` tùy chọn.

```json
{ "items": [{ "id": "j1", "date": "2026-10-10", "publishedAt": 1791600000000, "editedAt": null }] }
```

`GET /parent/journals/by-date?studentId={id}&date={ngày}` — bản đã xuất bản của một ngày. Không có: **404**.

```json
{
  "id": "j1",
  "date": "2026-10-10",
  "publishedAt": 1791600000000,
  "editedAt": 1791610000000,
  "classId": "c1",
  "sections": { "meal": "…", "learning": "…", "sleep": "…", "health": "…", "emotion": "…", "note": "…" },
  "personalNote": "Minh An mạnh dạn giơ tay phát biểu.",
  "photos": ["https://…/j1-1.jpg"],
  "attendance": { "status": "present", "note": "" }
}
```

- `personalNote` là ghi chú của đúng bé được hỏi (`""` nếu không có). Không trả map `personal`, `transcript`, `audio`, `issues`, `source`.
- `attendance` là bản ghi điểm danh của riêng bé ngày đó, `null` nếu chưa điểm danh.
- `editedAt` khác `null` khi giáo viên đã đăng lại một thay đổi.

### Cổng xuất bản (human-in-the-loop)

Phía server phải bảo đảm, không phụ thuộc vào UI:

- API của phụ huynh chỉ trả bản đã xuất bản. Nhật ký chưa từng xuất bản không tồn tại đối với phụ huynh; thay đổi chưa đăng lại không được trả.
- Phụ huynh không bao giờ nhận map `personal`, `transcript`, `audio` hay `source`.
- Không có đường nào đưa đầu ra AI thẳng tới `published`: bản nháp giọng nói luôn vào `review`, và phải qua `approve`.

> **Khác BE Specs:**
> - BE Specs đi thẳng `DRAFT` → `PUBLISHED`. Frontend có thêm bước `approved` ở giữa, và sửa sau khi duyệt thì phải duyệt lại.
> - BE Specs có `POST /teacher/journals/{journalId}/media` để tải và gắn ảnh trong một bước. Ở đây tách thành `POST /uploads` rồi `PUT /journals/{id}`, vì ảnh là một phần nội dung nháp và giáo viên có thể bỏ ảnh trước khi lưu.

---

## 9. PB17 — Trao đổi với phụ huynh

Trò chuyện 1–1 giữa giáo viên và một phụ huynh. Chỉ có văn bản: không tệp đính kèm, không ghi âm, không trả lời tự động bằng AI.

**Giáo viên nói chuyện được với ai:** mọi phụ huynh có liên kết `Active` với một học sinh thuộc lớp mình chủ nhiệm. Hội thoại xuất hiện trong danh sách ngay cả khi chưa có tin nhắn nào. Gửi tin cho người ngoài danh sách: **403**.

### `GET /conversations`

Tham số `q`: tìm trên `name` và `sub`, không phân biệt hoa thường và dấu.

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
| `peerId` | ID của phụ huynh |
| `sub` | `{quan hệ} of {tên bé}` |
| `unread` | Số tin phụ huynh gửi mà giáo viên chưa đọc |
| `last` | Tin mới nhất; `null` nếu chưa có |

Sắp xếp theo `last.at` giảm dần.

### `GET /conversations/{peerId}/messages`

Tham số `before` (epoch ms) và `limit` để tải dần tin cũ. Trả theo thời gian tăng dần.

```json
{
  "items": [
    {
      "id": "m1",
      "parentId": "par1",
      "teacherId": "t1",
      "from": "parent",
      "text": "Chào cô Mai, hôm qua bé An ngủ hơi muộn…",
      "at": 1791606000000,
      "read": true
    }
  ]
}
```

`from`: `parent` \| `teacher`. `read`: người nhận đã đọc hay chưa.

### `POST /conversations/{peerId}/messages`

```json
{ "text": "Trưa nay bé An ngủ được khoảng 90 phút, dậy rất tươi tỉnh chị nhé." }
```

`text` sau khi cắt khoảng trắng hai đầu không được rỗng. **201** trả tin nhắn vừa tạo (`read = false`).

Tác dụng phụ: thông báo cho phụ huynh — `type = message`, tiêu đề `Message from {tên giáo viên}`, nội dung là tin nhắn cắt còn 70 ký tự kèm `…` nếu dài hơn.

### `POST /conversations/{peerId}/read`

Đánh dấu đã đọc mọi tin phụ huynh gửi trong hội thoại. **204**. Frontend gọi khi mở một hội thoại có tin chưa đọc.

### `GET /conversations/unread-count`

`{ "count": 2 }` — dùng cho huy hiệu trên menu và thẻ "Unread parent messages" ở trang chủ.

Frontend chưa có cơ chế thời gian thực; bản đầu có thể gọi lại `GET /conversations` theo chu kỳ.

> **Khác BE Specs:** BE Specs có `GET /teacher/feedback` và `POST /teacher/feedback/{feedbackId}/reply`, lưu tương tác theo `StudentId`, `ParentId`, `TeacherId`. Frontend là chat theo cặp phụ huynh – giáo viên: tin nhắn chỉ có `parentId` và `teacherId`, không gắn với học sinh cụ thể, và không có khái niệm "trả lời một ghi chú". Phụ huynh có hai con cùng lớp chỉ có một hội thoại với giáo viên.

---

## 10. API hỗ trợ ngoài 8 PB

Giáo viên còn dùng các API sau; chi tiết ở [API.md](API.md).

| Method | Đường dẫn | Dùng để | Mục trong API.md |
| --- | --- | --- | --- |
| POST | `/auth/login` | Đăng nhập với `role = teacher` | 3.2 |
| POST | `/auth/refresh`, `/auth/logout` | Làm mới token, đăng xuất | 3.3, 3.4 |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Quên mật khẩu | 3.5, 3.6 |
| GET, PATCH | `/me` | Xem và sửa hồ sơ (tên, số điện thoại, email) | 3.7, 3.8 |
| PUT | `/me/password` | Đổi mật khẩu | 3.9 |
| GET | `/settings` | Đọc `aiJournal`, `maxPhotos`, `passwordMin` | 4.3 |
| GET | `/teacher/dashboard` | Trang chủ giáo viên | 13.3 |
| GET | `/notifications`, `/notifications/unread-count` | Thông báo trong ứng dụng | 10.3 |
| POST | `/notifications/read` | Đánh dấu đã đọc | 10.3 |

### `GET /teacher/dashboard`

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

| Trường | Ghi chú |
| --- | --- |
| `class` | `null` khi chưa được phân lớp; khi đó không có các trường còn lại |
| `students` | Số học sinh `Active` |
| `attendance` | Giống `counts` ở mục 4, tính cho hôm nay |
| `journal` | Nhật ký hôm nay; `null` nếu chưa tạo |
| `pendingReviews` | Số nhật ký của lớp đang ở `review` |
| `unreadMessages` | Số tin phụ huynh gửi chưa đọc |

### Thông báo giáo viên nhận được

| Sự kiện | `type` | `title` | `body` |
| --- | --- | --- | --- |
| Hiệu trưởng thêm học sinh vào lớp hoặc chuyển bé sang lớp mình | `system` | `Class roster updated` | `{bé} was added to {lớp}.` |
| Phụ huynh gửi tin nhắn | `message` | `Message from {phụ huynh}` | Tin nhắn, cắt còn 70 ký tự |
| Hiệu trưởng xuất bản thông báo trường cho giáo viên | `announcement` | Tiêu đề thông báo | Nội dung, cắt còn 110 ký tự |

Bấm vào thông báo `message` mở `/teacher/messages`; `journal` mở `/teacher/journal`; các loại khác mở hộp thoại xem nội dung.

---

## 11. Chỗ lệch với BE Specs

Tài liệu này theo frontend. Mỗi dòng dưới đây là một quyết định nhóm cần chốt: sửa BE Specs cho khớp, hay sửa frontend.

| # | PB | BE Specs | Frontend hiện tại | Nếu theo BE Specs thì frontend phải sửa |
| --- | --- | --- | --- | --- |
| 1 | PB09 | Hai endpoint: danh sách lớp, chi tiết học sinh | Một lần gọi trả cả hai | Không bắt buộc; chỉ là cách chia endpoint |
| 2 | PB11 | 4 trạng thái, có `LATE` và vắng có phép / không phép | `present`, `absent` và ghi chú tự do | Nút chọn trạng thái ở màn hình điểm danh, cách đếm sĩ số, báo cáo điểm danh của hiệu trưởng |
| 3 | PB11 | `GET …/attendance/summary` | Thống kê nằm trong `counts` | Không bắt buộc |
| 4 | PB12 | Trạng thái hoạt động lưu theo từng học sinh, ghi hàng loạt | Văn bản chung của cả lớp | Mô hình nhật ký, màn hình soạn, màn hình phụ huynh xem |
| 5 | PB13 | Ngoại lệ có cấu trúc, ghi đè trạng thái chung | Ghi chú văn bản, hiển thị kèm phần chung | Như dòng 4 |
| 6 | PB14 | Whisper và LLM ở server; nhận `.wav`, `.mp3`, `.m4a` | Chuyển giọng nói trong trình duyệt; ghi âm ra `audio/webm` | Bỏ phần nhận dạng trên trình duyệt, gửi tệp lên server |
| 7 | PB15 | Endpoint riêng `…/journals/manual` | Dùng chung endpoint với nhật ký AI | Không bắt buộc |
| 8 | PB16 | `DRAFT` → `PUBLISHED` | Có bước `approved`; sửa sau duyệt phải duyệt lại | Bỏ nút "Approve" nếu nhóm không cần bước này |
| 9 | PB16 | `POST …/journals/{id}/media` | `POST /uploads` rồi `PUT /journals/{id}` | Không bắt buộc |
| 10 | PB17 | Ghi chú phản hồi gắn với học sinh, có trả lời theo từng ghi chú | Chat theo cặp phụ huynh – giáo viên | Mô hình tin nhắn và cả hai màn hình chat |
| 11 | Chung | Tiền tố `/teacher/…` cho mọi đường dẫn | Chỉ `/teacher/class` và `/teacher/dashboard` có tiền tố; còn lại đặt theo tài nguyên vì hiệu trưởng và phụ huynh cũng dùng | Không bắt buộc |

Các dòng 2, 4, 5 và 10 thay đổi mô hình dữ liệu nên cần chốt trước khi thiết kế cơ sở dữ liệu. BE Specs không nhắc tới PB10.
