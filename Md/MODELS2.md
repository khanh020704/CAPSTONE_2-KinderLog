# KinderLog — Model còn thiếu cho API2.md

Tài liệu này đối chiếu [API2.md](API2.md) (API phân hệ Giáo viên) với cơ sở dữ liệu hiện có trong [MODELS.md](MODELS.md), rồi liệt kê những bảng và cột phải bổ sung để dựng được các API đó.

**Kết luận: chưa đủ.** Cơ sở dữ liệu hiện tại đáp ứng trọn vẹn phần điểm danh và phần lớn danh sách lớp. Phần nhật ký thiếu trạng thái và ghi chú riêng; phần tin nhắn và cấu hình chưa có bảng nào.

> Các bảng và cột ở mục 3 là **đề xuất**. Mã SQL ở mục 4 chưa được chạy thử, vì máy này không có SQL Server 2022 để khôi phục bản sao lưu.

## Mục lục

1. [Mức độ đáp ứng theo từng chức năng](#1-mức-độ-đáp-ứng-theo-từng-chức-năng)
2. [Phần đã có: ánh xạ API ↔ cột](#2-phần-đã-có-ánh-xạ-api--cột)
3. [Phần còn thiếu](#3-phần-còn-thiếu)
4. [Mã SQL bổ sung](#4-mã-sql-bổ-sung)
5. [Việc cần lưu ý khi áp dụng](#5-việc-cần-lưu-ý-khi-áp-dụng)
6. [Hướng ngược lại: sửa API2.md theo cơ sở dữ liệu](#6-hướng-ngược-lại-sửa-api2md-theo-cơ-sở-dữ-liệu)

---

## 1. Mức độ đáp ứng theo từng chức năng

| PB | API trong API2.md | Bảng hiện có dùng được | Đánh giá | Còn thiếu |
| --- | --- | --- | --- | --- |
| PB09 | `GET /teacher/class` | `Classes`, `Students`, `Parent_Student_Map`, `Users` | Gần đủ | Ảnh học sinh; trạng thái của liên kết phụ huynh–con |
| PB11 | `GET`, `PUT /attendance` | `Attendance` | **Đủ** | Chỉ thiếu thời điểm sửa lần cuối (`savedAt`) |
| PB12 | `PUT /journals/{id}` — `sections` | `Class_Daily_Summaries` | Thiếu | Mục `note`; độ dài cột quá ngắn |
| PB13 | `PUT /journals/{id}` — `personal` | Không có bảng phù hợp | **Thiếu** | Bảng ghi chú riêng theo học sinh |
| PB14 | `POST /journals/voice-draft`, `/recordings` | `AI_Processing_Logs` | Thiếu | Liên kết bản ghi âm với nhật ký; cấu hình `aiJournal` |
| PB15 | `POST /journals`, `PUT /journals/{id}` | `Class_Daily_Summaries` | Thiếu | Nguồn tạo (`manual` / `voice`) |
| PB16 | `approve`, `publish`, `POST /uploads` | `Class_Daily_Summaries`, `Journal_Photos` | Thiếu | Trạng thái nhật ký lớp; thời điểm xuất bản; cấu hình `maxPhotos` |
| PB17 | `/conversations/…` | Không có | **Thiếu** | Bảng tin nhắn |
| Hỗ trợ | Đăng nhập, hồ sơ | `Users` | Gần đủ | Số điện thoại duy nhất; trạng thái khóa; bảng token |
| Hỗ trợ | `/notifications` | `Notifications` | Gần đủ | Hai loại thông báo mới |
| Hỗ trợ | `GET /settings` | Không có | **Thiếu** | Bảng cấu hình |
| Hỗ trợ | `GET /teacher/dashboard` | Tính từ các bảng trên | Đủ khi các mục trên xong | |

---

## 2. Phần đã có: ánh xạ API ↔ cột

### 2.1 Lớp, học sinh, phụ huynh (PB09)

| Trường trong API2.md | Cột |
| --- | --- |
| `class.id`, `class.name` | `Classes.ClassID`, `Classes.ClassName` — lớp của giáo viên: `Classes.TeacherID = Users.UserID` |
| `students[].id`, `name`, `dob`, `gender` | `Students.StudentID`, `FullName`, `DateOfBirth`, `Gender` |
| Chỉ học sinh `Active` | `Students.IsActive = 1` |
| `students[].note` | `Students.HealthNote` (và `AllergyHistory`) — xem mục 3.1 |
| `students[].today` | `Attendance.Status` của ngày hôm nay |
| `parents[].name`, `phone` | `Users.FullName`, `Users.PhoneNumber` qua `Parent_Student_Map.ParentID` |
| `parents[].relationship` | `Parent_Student_Map.Relationship` — cần đổi giá trị, xem bảng dưới |

`Parent_Student_Map.Relationship` lưu tiếng Việt, còn API2.md dùng tiếng Anh. Backend đổi qua lại theo bảng:

| API2.md | Cơ sở dữ liệu |
| --- | --- |
| `Mother` | `Mẹ` |
| `Father` | `Cha` |
| `Grandmother` | `Bà` |
| `Grandfather` | `Ông` |
| `Guardian` | `Người giám hộ` |
| (không có) | `Khác` |

`Students.Gender` có thêm giá trị `Other` mà frontend chưa hiển thị.

### 2.2 Điểm danh (PB11)

Bảng `Attendance` lưu mỗi học sinh một dòng mỗi ngày (`UQ_Attendance_Student_Date`). API2.md trả cả bảng điểm danh của lớp dưới dạng map; backend gom các dòng có cùng `ClassID` và `AttendanceDate`.

| Trường trong API2.md | Cột |
| --- | --- |
| `classId`, `date` | `ClassID`, `AttendanceDate` |
| Khóa của `records` | `StudentID` |
| `records[].status` | `Status`: `present` ↔ `Present`, `absent` ↔ `Absent` |
| `records[].note` | `Note` (tối đa 255 ký tự) |
| Người lưu | `RecordedBy` |
| `counts.total` | Đếm `Students` có `ClassID` đó và `IsActive = 1` |

`PUT /attendance` ghi đè cả bảng: xóa các dòng của (lớp, ngày) rồi chèn lại, hoặc `MERGE` theo (`StudentID`, `AttendanceDate`).

Cơ sở dữ liệu còn có `Late` và `Excused`. API2.md chưa dùng hai giá trị này; nếu có dữ liệu cũ mang hai giá trị đó, backend cần quyết định trả về thế nào (API2.md chỉ biết `present`, `absent` hoặc không có bản ghi).

### 2.3 Nhật ký của lớp (PB12, PB15, PB16)

API2.md coi nhật ký là **một bản ghi cho mỗi lớp mỗi ngày**. Trong cơ sở dữ liệu, bảng khớp với khái niệm đó là `Class_Daily_Summaries` (duy nhất theo `ClassID` + `SummaryDate`), **không phải** `Daily_Journals` (mỗi học sinh một dòng).

| Trường trong API2.md | Cột của `Class_Daily_Summaries` |
| --- | --- |
| `id` | `SummaryID` |
| `classId`, `date` | `ClassID`, `SummaryDate` |
| `sections.meal` | `GeneralMeal` |
| `sections.learning` | `GeneralStudy` |
| `sections.sleep` | `GeneralSleep` |
| `sections.health` | `GeneralHealth` |
| `sections.emotion` | `GeneralMood` |
| `sections.note` | **chưa có** |
| `updatedAt` | `UpdatedAt` (không có trigger tự cập nhật; backend tự gán) |
| Người tạo | `CreatedBy` |
| `status`, `source`, `transcript`, `publishedAt` | **chưa có** |

Cột `GeneralPlay` không ứng với mục nào của API2.md. Ba cột `TotalStudents`, `PresentCount`, `AbsentCount` không cần cho API2.md vì số liệu này được tính từ `Attendance`.

### 2.4 Ảnh nhật ký (PB16)

| Trường trong API2.md | Cột của `Journal_Photos` |
| --- | --- |
| `photos[]` | `PhotoUrl` của các dòng có `SummaryID` = nhật ký |
| Lớp | `ClassID` |
| Người tải | `UploadedBy` |

Bảng này đã đủ. Ràng buộc `CK_JP_Reference` yêu cầu `JournalID` hoặc `SummaryID` khác null, nên ảnh phải được gắn vào nhật ký ngay khi chèn dòng: `POST /uploads` chỉ lưu tệp và trả URL, còn dòng `Journal_Photos` được tạo ở `PUT /journals/{id}`.

Cột `IsApproved` (mặc định 0) không có khái niệm tương ứng trong API2.md, nơi ảnh đi cùng trạng thái của nhật ký. Backend nên đặt `IsApproved = 1` khi xuất bản nhật ký.

### 2.5 Thông báo

| Trường trong API2.md | Cột của `Notifications` |
| --- | --- |
| `id` | `NotificationID` |
| Người nhận | `UserID` — mỗi người nhận một dòng |
| `title`, `body` | `Title`, `Content` |
| `at` | `SentAt` |
| `read` | `IsRead`, `ReadAt` |
| `type` | `Type` — xem mục 3.6 |

API.md mô tả thông báo gửi theo vai trò hoặc theo lớp; với bảng này backend nhân ra thành một dòng cho mỗi người nhận lúc tạo. Cách này đơn giản hơn và trạng thái đã đọc nằm ngay trên dòng.

### 2.6 Tài khoản

| Trường trong API | Cột của `Users` |
| --- | --- |
| `id`, `name`, `email`, `phone` | `UserID`, `FullName`, `Email`, `PhoneNumber` |
| `role` | `Role`: `teacher` ↔ `TEACHER`, `parent` ↔ `PARENT`, `admin` ↔ `ADMIN` |
| Mật khẩu | `PasswordHash` |
| `status` | `IsActive`: 1 → `Active`, 0 → `Inactive` |
| `lastLogin`, `createdAt` | `LastLoginAt`, `CreatedAt` |

### 2.7 Audit log

| Trường trong API | Cột của `Audit_Logs` |
| --- | --- |
| `action` | `Action` |
| `module` | `EntityName` |
| `description` | `Description` |
| `at` | `CreatedAt` |
| `user`, `role` | Lấy qua `UserID` |
| `status` (`Success` / `Failed`) | **chưa có** |

---

## 3. Phần còn thiếu

### 3.1 Cột thêm vào bảng có sẵn

| Bảng | Cột mới | Kiểu | Dùng cho |
| --- | --- | --- | --- |
| `Students` | `PhotoUrl` | `nvarchar(500)` null | `students[].photo` (PB09) |
| `Parent_Student_Map` | `IsActive` | `bit` not null, mặc định 1 | Liên kết `Active` / `Inactive`: quyết định phụ huynh nào giáo viên nhìn thấy và nhắn tin được (PB09, PB17) |
| `Attendance` | `UpdatedAt` | `datetime2` null | `savedAt` khi sửa lại điểm danh ngày cũ (PB11) |
| `Class_Daily_Summaries` | `GeneralNote` | `nvarchar(2000)` null | `sections.note` (PB12) |
| `Class_Daily_Summaries` | `Status` | `nvarchar(20)` not null, mặc định `DRAFT` | Vòng đời nhật ký (PB16) |
| `Class_Daily_Summaries` | `InputMethod` | `nvarchar(20)` null | `source`: `MANUAL` / `VOICE` (PB14, PB15) |
| `Class_Daily_Summaries` | `RawTranscript` | `nvarchar(max)` null | `transcript` (PB14) |
| `Class_Daily_Summaries` | `ApprovedAt` | `datetime2` null | Thời điểm duyệt (PB16) |
| `Class_Daily_Summaries` | `PublishedAt` | `datetime2` null | `publishedAt` (PB16) |
| `AI_Processing_Logs` | `SummaryID` | `int` null, FK → `Class_Daily_Summaries` | `audio[]`: các bản ghi âm của một nhật ký (PB14) |
| `Users` | `IsLocked` | `bit` not null, mặc định 0 | Lỗi `ACCOUNT_LOCKED` khi đăng nhập |
| `Audit_Logs` | `Status` | `nvarchar(10)` not null, mặc định `Success` | Ghi lần đăng nhập bị chặn với `Failed` |

Về `students[].note`: API2.md có một trường ghi chú chung cho giáo viên (dị ứng, người đón…). Cơ sở dữ liệu đã có `AllergyHistory` và `HealthNote`. Đề xuất không thêm cột: trả `note` bằng cách ghép hai cột này, hoặc đổi API2.md để trả riêng `allergyHistory` và `healthNote`.

### 3.2 Cột cần nới độ dài

Sáu cột `General*` của `Class_Daily_Summaries` hiện là `nvarchar(255)`. Mỗi mục nhật ký trong frontend không giới hạn độ dài, và mỗi lần ghi âm thêm lại nối văn bản mới vào cuối, nên 255 ký tự sẽ bị tràn. Đề xuất nới thành `nvarchar(2000)` cho `GeneralMeal`, `GeneralSleep`, `GeneralStudy`, `GeneralHealth`, `GeneralMood`.

### 3.3 Trạng thái nhật ký lớp

Giá trị của `Class_Daily_Summaries.Status`:

| Giá trị | Ứng với API2.md | Ý nghĩa |
| --- | --- | --- |
| `DRAFT` | `draft` | Đang viết tay |
| `REVIEW` | `review` | Bản nháp từ giọng nói, chờ giáo viên kiểm tra |
| `APPROVED` | `approved` | Đã duyệt, chưa gửi phụ huynh |
| `PUBLISHED` | `published` | Phụ huynh xem được |

Lưu ý tên gọi dễ nhầm: ở bảng `Daily_Journals` có sẵn, `APPROVED` là trạng thái **phụ huynh đã xem được** (view `vw_ParentJournalView` lọc theo `APPROVED`). Ở bảng nhật ký lớp theo API2.md, `APPROVED` mới là bước trước khi gửi, còn `PUBLISHED` mới là lúc phụ huynh xem được.

### 3.4 Bảng mới: `Journal_Personal_Notes` (PB13)

Ghi chú riêng của giáo viên về một bé trong nhật ký của lớp; chỉ phụ huynh của bé đó xem được.

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| NoteID | int | không | | PK, IDENTITY |
| SummaryID | int | không | | FK → Class_Daily_Summaries.SummaryID |
| StudentID | int | không | | FK → Students.StudentID |
| Content | nvarchar(2000) | không | | |
| CreatedAt | datetime2(7) | không | `sysdatetime()` | |
| UpdatedAt | datetime2(7) | có | | |

Duy nhất theo (`SummaryID`, `StudentID`): mỗi bé tối đa một ghi chú trong một nhật ký.

Vì sao không dùng lại `Daily_Journals` với `IsException = 1`: bảng đó không có cột văn bản tự do (chỉ có sáu cột chi tiết theo chủ đề và `Symptoms`), có vòng trạng thái riêng, và trigger `trg_DailyJournals_NotifyParent` tự gửi thông báo khi chuyển sang `APPROVED`. Dùng lại sẽ khiến một ghi chú riêng được duyệt và thông báo tách rời khỏi nhật ký của lớp.

### 3.5 Bảng mới: `Messages` (PB17)

Tin nhắn 1–1 giữa một phụ huynh và một giáo viên. Bảng `Feedbacks` có sẵn không dùng được cho việc này: mỗi dòng gắn với một `JournalID`, chỉ có `ParentID`, không có giáo viên và không có chiều giáo viên trả lời.

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| MessageID | bigint | không | | PK, IDENTITY |
| ParentID | int | không | | FK → Users.UserID |
| TeacherID | int | không | | FK → Users.UserID |
| SenderRole | nvarchar(10) | không | | `PARENT` hoặc `TEACHER` — trường `from` |
| Content | nvarchar(2000) | không | | Trường `text` |
| IsRead | bit | không | `0` | Người nhận đã đọc |
| ReadAt | datetime2(7) | có | | |
| SentAt | datetime2(7) | không | `sysdatetime()` | Trường `at` |

Chỉ mục:

- (`ParentID`, `TeacherID`, `SentAt`) — tải một hội thoại theo thời gian.
- (`TeacherID`, `IsRead`) và (`ParentID`, `IsRead`) — đếm tin chưa đọc.

Một hội thoại là một cặp (`ParentID`, `TeacherID`); không cần bảng hội thoại riêng. Danh sách hội thoại của giáo viên được tính từ `Classes` → `Students` → `Parent_Student_Map` (`IsActive = 1`), nên hội thoại vẫn hiện ra khi chưa có tin nhắn nào.

### 3.6 Loại thông báo

`CK_Noti_Type` hiện cho phép `JOURNAL_NEW`, `HEALTH_ALERT`, `SYSTEM`, `FEEDBACK`. Cần thêm hai giá trị:

| `type` trong API2.md | `Notifications.Type` | Trạng thái |
| --- | --- | --- |
| `journal` | `JOURNAL_NEW` | Đã có |
| `system` | `SYSTEM` | Đã có |
| `message` | `MESSAGE` | **Thêm** |
| `announcement` | `ANNOUNCEMENT` | **Thêm** |

Thông báo về nhật ký của lớp trỏ tới `Class_Daily_Summaries`, trong khi `Notifications` chỉ có `JournalID` (trỏ tới `Daily_Journals`). Đề xuất thêm cột `SummaryID` null để frontend mở đúng nhật ký khi bấm vào thông báo.

### 3.7 Bảng mới: `System_Settings`

API2.md cần đọc `aiJournal` (bật hoặc tắt ghi âm AI), `maxPhotos` (số ảnh tối đa mỗi nhật ký) và `passwordMin`.

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| SettingKey | nvarchar(50) | không | | PK |
| SettingValue | nvarchar(500) | không | | |
| UpdatedAt | datetime2(7) | không | `sysdatetime()` | |

Các khóa ban đầu, theo giá trị mặc định của frontend:

| `SettingKey` | `SettingValue` |
| --- | --- |
| `platformName` | `KinderLog` |
| `supportEmail` | `hotro@kinderlog.vn` |
| `sessionTimeout` | `60` |
| `passwordMin` | `6` |
| `aiJournal` | `true` |
| `sttLanguage` | `Vietnamese` |
| `maxPhotos` | `6` |

### 3.8 Đăng nhập và token

| Thiếu | Đề xuất |
| --- | --- |
| Đăng nhập bằng số điện thoại | `Users.PhoneNumber` hiện cho phép null và không duy nhất, trong khi `Username` bắt buộc và duy nhất. Thêm chỉ mục duy nhất có lọc trên `PhoneNumber` (bỏ qua null) |
| Trạng thái `Locked` | Cột `Users.IsLocked` ở mục 3.1 |
| `POST /auth/refresh`, `/auth/logout` | Bảng `Refresh_Tokens` |
| `POST /auth/forgot-password`, `/auth/reset-password` | Bảng `Password_Reset_Tokens` |

`Refresh_Tokens`:

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| TokenID | bigint | không | | PK, IDENTITY |
| UserID | int | không | | FK → Users.UserID |
| TokenHash | nvarchar(128) | không | | UNIQUE — lưu mã băm, không lưu token gốc |
| ExpiresAt | datetime2(7) | không | | |
| RevokedAt | datetime2(7) | có | | Gán khi đăng xuất hoặc khi tài khoản bị khóa |
| CreatedAt | datetime2(7) | không | `sysdatetime()` | |

`Password_Reset_Tokens` có cùng cấu trúc, thay `RevokedAt` bằng `UsedAt`.

Hai bảng token chỉ cần khi nhóm chọn cơ chế refresh token và đặt lại mật khẩu qua email như API.md đề xuất. Nếu dùng JWT ngắn hạn không refresh thì bỏ `Refresh_Tokens`.

### 3.9 Ngoài phạm vi API2.md

`Users.Role` không có vai trò hiệu trưởng, và chưa có bảng cho camera, lịch camera, thông báo trường, năm học. Những thứ này thuộc [API.md](API.md), không cần cho phân hệ Giáo viên. Điểm duy nhất chạm tới giáo viên: thông báo `Class roster updated` và thông báo trường do hiệu trưởng tạo ra; giáo viên chỉ đọc chúng qua bảng `Notifications`.

---

## 4. Mã SQL bổ sung

Chạy trên cơ sở dữ liệu `C2SE10_KinderLog_new`. **Chưa chạy thử** — hãy chạy trên bản sao trước.

```sql
-- ============================================================
-- 1. Cột thêm vào bảng có sẵn
-- ============================================================
ALTER TABLE Students ADD PhotoUrl NVARCHAR(500) NULL;

ALTER TABLE Parent_Student_Map
    ADD IsActive BIT NOT NULL CONSTRAINT DF_PSM_IsActive DEFAULT (1);

ALTER TABLE Attendance ADD UpdatedAt DATETIME2 NULL;

ALTER TABLE Users
    ADD IsLocked BIT NOT NULL CONSTRAINT DF_Users_IsLocked DEFAULT (0);

ALTER TABLE Audit_Logs
    ADD Status NVARCHAR(10) NOT NULL CONSTRAINT DF_Audit_Status DEFAULT (N'Success');
ALTER TABLE Audit_Logs
    ADD CONSTRAINT CK_Audit_Status CHECK (Status IN (N'Success', N'Failed'));

-- ============================================================
-- 2. Nhật ký của lớp
-- ============================================================
ALTER TABLE Class_Daily_Summaries ALTER COLUMN GeneralMeal   NVARCHAR(2000) NULL;
ALTER TABLE Class_Daily_Summaries ALTER COLUMN GeneralSleep  NVARCHAR(2000) NULL;
ALTER TABLE Class_Daily_Summaries ALTER COLUMN GeneralStudy  NVARCHAR(2000) NULL;
ALTER TABLE Class_Daily_Summaries ALTER COLUMN GeneralHealth NVARCHAR(2000) NULL;
ALTER TABLE Class_Daily_Summaries ALTER COLUMN GeneralMood   NVARCHAR(2000) NULL;

ALTER TABLE Class_Daily_Summaries ADD
    GeneralNote   NVARCHAR(2000) NULL,
    Status        NVARCHAR(20)   NOT NULL CONSTRAINT DF_CDS_Status DEFAULT (N'DRAFT'),
    InputMethod   NVARCHAR(20)   NULL,
    RawTranscript NVARCHAR(MAX)  NULL,
    ApprovedAt    DATETIME2      NULL,
    PublishedAt   DATETIME2      NULL;

ALTER TABLE Class_Daily_Summaries ADD
    CONSTRAINT CK_CDS_Status
        CHECK (Status IN (N'DRAFT', N'REVIEW', N'APPROVED', N'PUBLISHED')),
    CONSTRAINT CK_CDS_InputMethod
        CHECK (InputMethod IS NULL OR InputMethod IN (N'MANUAL', N'VOICE'));

CREATE INDEX IX_CDS_Status ON Class_Daily_Summaries (ClassID, Status);

ALTER TABLE AI_Processing_Logs ADD SummaryID INT NULL;
ALTER TABLE AI_Processing_Logs
    ADD CONSTRAINT FK_AILog_Summary
        FOREIGN KEY (SummaryID) REFERENCES Class_Daily_Summaries (SummaryID);

-- ============================================================
-- 3. Ghi chú riêng theo học sinh
-- ============================================================
CREATE TABLE Journal_Personal_Notes (
    NoteID    INT IDENTITY(1,1) NOT NULL,
    SummaryID INT            NOT NULL,
    StudentID INT            NOT NULL,
    Content   NVARCHAR(2000) NOT NULL,
    CreatedAt DATETIME2      NOT NULL CONSTRAINT DF_JPN_CreatedAt DEFAULT (SYSDATETIME()),
    UpdatedAt DATETIME2      NULL,
    CONSTRAINT PK_Journal_Personal_Notes PRIMARY KEY (NoteID),
    CONSTRAINT UQ_JPN_Summary_Student UNIQUE (SummaryID, StudentID),
    CONSTRAINT FK_JPN_Summary FOREIGN KEY (SummaryID) REFERENCES Class_Daily_Summaries (SummaryID),
    CONSTRAINT FK_JPN_Student FOREIGN KEY (StudentID) REFERENCES Students (StudentID)
);

CREATE INDEX IX_JPN_StudentID ON Journal_Personal_Notes (StudentID);

-- ============================================================
-- 4. Tin nhắn giáo viên – phụ huynh
-- ============================================================
CREATE TABLE Messages (
    MessageID  BIGINT IDENTITY(1,1) NOT NULL,
    ParentID   INT            NOT NULL,
    TeacherID  INT            NOT NULL,
    SenderRole NVARCHAR(10)   NOT NULL,
    Content    NVARCHAR(2000) NOT NULL,
    IsRead     BIT            NOT NULL CONSTRAINT DF_Msg_IsRead DEFAULT (0),
    ReadAt     DATETIME2      NULL,
    SentAt     DATETIME2      NOT NULL CONSTRAINT DF_Msg_SentAt DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_Messages PRIMARY KEY (MessageID),
    CONSTRAINT FK_Msg_Parent  FOREIGN KEY (ParentID)  REFERENCES Users (UserID),
    CONSTRAINT FK_Msg_Teacher FOREIGN KEY (TeacherID) REFERENCES Users (UserID),
    CONSTRAINT CK_Msg_SenderRole CHECK (SenderRole IN (N'PARENT', N'TEACHER'))
);

CREATE INDEX IX_Msg_Conversation   ON Messages (ParentID, TeacherID, SentAt);
CREATE INDEX IX_Msg_Teacher_Unread ON Messages (TeacherID, IsRead);
CREATE INDEX IX_Msg_Parent_Unread  ON Messages (ParentID, IsRead);

-- ============================================================
-- 5. Thông báo: thêm loại và liên kết tới nhật ký lớp
-- ============================================================
ALTER TABLE Notifications DROP CONSTRAINT CK_Noti_Type;
ALTER TABLE Notifications
    ADD CONSTRAINT CK_Noti_Type CHECK (Type IN (
        N'JOURNAL_NEW', N'HEALTH_ALERT', N'SYSTEM', N'FEEDBACK',
        N'MESSAGE', N'ANNOUNCEMENT'));

ALTER TABLE Notifications ADD SummaryID INT NULL;
ALTER TABLE Notifications
    ADD CONSTRAINT FK_Noti_Summary
        FOREIGN KEY (SummaryID) REFERENCES Class_Daily_Summaries (SummaryID);

-- ============================================================
-- 6. Cấu hình hệ thống
-- ============================================================
CREATE TABLE System_Settings (
    SettingKey   NVARCHAR(50)  NOT NULL,
    SettingValue NVARCHAR(500) NOT NULL,
    UpdatedAt    DATETIME2     NOT NULL CONSTRAINT DF_Settings_UpdatedAt DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_System_Settings PRIMARY KEY (SettingKey)
);

INSERT INTO System_Settings (SettingKey, SettingValue) VALUES
    (N'platformName',   N'KinderLog'),
    (N'supportEmail',   N'hotro@kinderlog.vn'),
    (N'sessionTimeout', N'60'),
    (N'passwordMin',    N'6'),
    (N'aiJournal',      N'true'),
    (N'sttLanguage',    N'Vietnamese'),
    (N'maxPhotos',      N'6');

-- ============================================================
-- 7. Đăng nhập và token
-- ============================================================
-- Sẽ lỗi nếu đang có hai tài khoản trùng số điện thoại: kiểm tra trước (mục 5).
CREATE UNIQUE INDEX UQ_Users_PhoneNumber
    ON Users (PhoneNumber) WHERE PhoneNumber IS NOT NULL;

CREATE TABLE Refresh_Tokens (
    TokenID   BIGINT IDENTITY(1,1) NOT NULL,
    UserID    INT           NOT NULL,
    TokenHash NVARCHAR(128) NOT NULL,
    ExpiresAt DATETIME2     NOT NULL,
    RevokedAt DATETIME2     NULL,
    CreatedAt DATETIME2     NOT NULL CONSTRAINT DF_RT_CreatedAt DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_Refresh_Tokens PRIMARY KEY (TokenID),
    CONSTRAINT UQ_RT_TokenHash UNIQUE (TokenHash),
    CONSTRAINT FK_RT_User FOREIGN KEY (UserID) REFERENCES Users (UserID)
);

CREATE TABLE Password_Reset_Tokens (
    TokenID   BIGINT IDENTITY(1,1) NOT NULL,
    UserID    INT           NOT NULL,
    TokenHash NVARCHAR(128) NOT NULL,
    ExpiresAt DATETIME2     NOT NULL,
    UsedAt    DATETIME2     NULL,
    CreatedAt DATETIME2     NOT NULL CONSTRAINT DF_PRT_CreatedAt DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_Password_Reset_Tokens PRIMARY KEY (TokenID),
    CONSTRAINT UQ_PRT_TokenHash UNIQUE (TokenHash),
    CONSTRAINT FK_PRT_User FOREIGN KEY (UserID) REFERENCES Users (UserID)
);
```

---

## 5. Việc cần lưu ý khi áp dụng

**Kiểm tra dữ liệu trước khi thêm ràng buộc duy nhất.** Script đọc bản sao lưu chỉ lấy cấu trúc, không đọc dữ liệu, nên chưa biết có số điện thoại trùng hay không:

```sql
SELECT PhoneNumber, COUNT(*) AS SoTaiKhoan
FROM Users
WHERE PhoneNumber IS NOT NULL
GROUP BY PhoneNumber
HAVING COUNT(*) > 1;
```

**Một giáo viên chủ nhiệm một lớp.** API2.md giả định điều này (`GET /teacher/class` trả đúng một lớp), nhưng `Classes.TeacherID` không có ràng buộc duy nhất, và `UQ_Classes_Code` cho phép cùng mã lớp ở nhiều năm học. Backend nên lấy lớp theo `TeacherID`, `IsActive = 1` và năm học hiện tại. Có thể thêm chỉ mục duy nhất có lọc sau khi kiểm tra dữ liệu:

```sql
SELECT TeacherID, COUNT(*) AS SoLop
FROM Classes
WHERE TeacherID IS NOT NULL AND IsActive = 1
GROUP BY TeacherID
HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX UQ_Classes_ActiveTeacher
    ON Classes (TeacherID) WHERE TeacherID IS NOT NULL AND IsActive = 1;
```

**Trigger `trg_DailyJournals_NotifyParent` vẫn chạy.** Nó tự chèn thông báo tiếng Việt cho phụ huynh mỗi khi một dòng `Daily_Journals` chuyển sang `APPROVED`. Các API trong API2.md không ghi vào `Daily_Journals` nên không kích hoạt trigger này. Nhưng nếu thủ tục `sp_BulkCreateJournals` hoặc phần khác của hệ thống vẫn dùng `Daily_Journals` song song, phụ huynh sẽ nhận hai luồng thông báo về cùng một ngày.

**Hai view có sẵn không phục vụ API2.md.** `vw_ParentJournalView` và `vw_ClassJournalProgress` đọc từ `Daily_Journals`. Phần phụ huynh xem nhật ký lớp cần truy vấn mới trên `Class_Daily_Summaries` với `Status = N'PUBLISHED'`, kèm đúng một dòng `Journal_Personal_Notes` của con họ.

**`UpdatedAt` không tự cập nhật.** Chỉ `Users` và `Daily_Journals` có trigger gán `UpdatedAt`. Với `Class_Daily_Summaries`, `Attendance` và `Journal_Personal_Notes`, backend tự gán khi ghi.

**Múi giờ.** Các cột thời gian dùng `SYSDATETIME()` (giờ của máy chủ), còn API trả epoch mili giây. Backend cần biết múi giờ của máy chủ cơ sở dữ liệu để đổi cho đúng; nếu dựng mới, nên dùng `SYSUTCDATETIME()`.

---

## 6. Hướng ngược lại: sửa API2.md theo cơ sở dữ liệu

Cơ sở dữ liệu hiện tại được thiết kế theo tài liệu BE Specs, không theo frontend. Mọi bổ sung ở mục 3 và 4 chỉ cần khi nhóm giữ API2.md như đang viết. Nếu nhóm chọn theo BE Specs thì gần như không phải đổi cơ sở dữ liệu, mà đổi API2.md và frontend:

| Phần | Theo API2.md (đổi cơ sở dữ liệu) | Theo cơ sở dữ liệu (đổi API2.md và frontend) |
| --- | --- | --- |
| Nhật ký | Thêm trạng thái và 6 cột vào `Class_Daily_Summaries`, thêm bảng `Journal_Personal_Notes` | Nhật ký theo từng học sinh trong `Daily_Journals`; ghi hàng loạt bằng `sp_BulkCreateJournals`; ngoại lệ bằng `IsException` và `Symptoms` |
| Vòng duyệt | `DRAFT` → `REVIEW` → `APPROVED` → `PUBLISHED` | `DRAFT` → `APPROVED` (phụ huynh xem được) hoặc `REJECTED` |
| Điểm danh | Dùng 2 trong 4 trạng thái | Frontend thêm `Late` và `Excused` |
| Trao đổi | Thêm bảng `Messages` | Dùng `Feedbacks` gắn với từng nhật ký; cần thêm chiều giáo viên trả lời |
| Cấu hình, token | Thêm bảng — cần ở cả hai hướng | Thêm bảng — cần ở cả hai hướng |

Dù theo hướng nào, các mục sau vẫn phải bổ sung vì cả hai tài liệu đều cần: ảnh học sinh (`Students.PhotoUrl`), bảng cấu hình, bảng token, số điện thoại duy nhất, và chiều giáo viên trả lời phụ huynh.
