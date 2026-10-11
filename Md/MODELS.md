# KinderLog — Mô hình dữ liệu (Database Models)

Tài liệu này được sinh tự động bởi `Debug/read_bak_models.py` từ tệp sao lưu `BackUp/C2SE10_KinderLog_new.bak`.
Đừng sửa tay: chạy lại script khi có bản sao lưu mới.

- Số bảng: **13**
- Số khóa ngoại: **24**
- View: **2**, stored procedure: **2**, trigger: **3**

Không tính bảng `sysdiagrams` và các thủ tục `sp_*diagram*` do SSMS tự thêm cho tính năng vẽ sơ đồ.

## Tổng quan

| Bảng | Số cột | Khóa chính | Tham chiếu tới |
| --- | --- | --- | --- |
| [Users](#users) | 12 | UserID | — |
| [AI_Processing_Logs](#ai_processing_logs) | 11 | LogID | Users |
| [Classes](#classes) | 11 | ClassID | Users |
| [Students](#students) | 13 | StudentID | Classes |
| [Attendance](#attendance) | 8 | AttendanceID | Classes, Students, Users |
| [Audit_Logs](#audit_logs) | 8 | AuditID | Users |
| [Class_Daily_Summaries](#class_daily_summaries) | 15 | SummaryID | Classes, Users |
| [Daily_Journals](#daily_journals) | 21 | JournalID | Classes, Students, Users |
| [Feedbacks](#feedbacks) | 6 | FeedbackID | Daily_Journals, Users |
| [Journal_Photos](#journal_photos) | 9 | PhotoID | Class_Daily_Summaries, Classes, Daily_Journals, Users |
| [Notifications](#notifications) | 10 | NotificationID | Daily_Journals, Students, Users |
| [Parent_Student_Map](#parent_student_map) | 7 | MapID | Students, Users |
| [Schools](#schools) | 9 | SchoolID | — |

## Quan hệ

| Bảng con | Cột | Bảng cha | Cột | Ràng buộc |
| --- | --- | --- | --- | --- |
| AI_Processing_Logs | UserID | Users | UserID | FK_AILog_User |
| Classes | TeacherID | Users | UserID | FK_Classes_Teacher |
| Students | ClassID | Classes | ClassID | FK_Students_Class |
| Attendance | ClassID | Classes | ClassID | FK_Attendance_Class |
| Attendance | StudentID | Students | StudentID | FK_Attendance_Student |
| Attendance | RecordedBy | Users | UserID | FK_Attendance_Teacher |
| Audit_Logs | UserID | Users | UserID | FK_Audit_User |
| Class_Daily_Summaries | ClassID | Classes | ClassID | FK_CDS_Class |
| Class_Daily_Summaries | CreatedBy | Users | UserID | FK_CDS_Teacher |
| Daily_Journals | ApprovedBy | Users | UserID | FK_DJ_ApprovedBy |
| Daily_Journals | ClassID | Classes | ClassID | FK_DJ_Class |
| Daily_Journals | CreatedBy | Users | UserID | FK_DJ_CreatedBy |
| Daily_Journals | StudentID | Students | StudentID | FK_DJ_Student |
| Feedbacks | JournalID | Daily_Journals | JournalID | FK_FB_Journal |
| Feedbacks | ParentID | Users | UserID | FK_FB_Parent |
| Journal_Photos | ClassID | Classes | ClassID | FK_JP_Class |
| Journal_Photos | JournalID | Daily_Journals | JournalID | FK_JP_Journal |
| Journal_Photos | SummaryID | Class_Daily_Summaries | SummaryID | FK_JP_Summary |
| Journal_Photos | UploadedBy | Users | UserID | FK_JP_Uploader |
| Notifications | JournalID | Daily_Journals | JournalID | FK_Noti_Journal |
| Notifications | StudentID | Students | StudentID | FK_Noti_Student |
| Notifications | UserID | Users | UserID | FK_Noti_User |
| Parent_Student_Map | ParentID | Users | UserID | FK_PSM_Parent |
| Parent_Student_Map | StudentID | Students | StudentID | FK_PSM_Student |

## Các bảng

### Users

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| UserID | int | không |  | PK, IDENTITY |
| Username | nvarchar(50) | không |  | UNIQUE |
| PasswordHash | nvarchar(255) | không |  |  |
| FullName | nvarchar(100) | không |  |  |
| Email | nvarchar(150) | có |  | UNIQUE |
| PhoneNumber | nvarchar(15) | có |  |  |
| Role | nvarchar(20) | không |  |  |
| AvatarUrl | nvarchar(500) | có |  |  |
| IsActive | bit | không | `1` |  |
| LastLoginAt | datetime2(7) | có |  |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |
| UpdatedAt | datetime2(7) | có |  |  |

Khóa và chỉ mục:

- Khóa chính `PK_Users` (UserID), clustered
- Duy nhất `UQ_Users_Email` (Email)
- Duy nhất `UQ_Users_Username` (Username)

Ràng buộc CHECK:

- `CK_Users_Role`: `[Role]=N'PARENT' OR [Role]=N'TEACHER' OR [Role]=N'ADMIN'`

Trigger: `trg_Users_UpdatedAt`

### AI_Processing_Logs

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| LogID | int | không |  | PK, IDENTITY |
| UserID | int | có |  | FK → Users.UserID |
| AudioUrl | nvarchar(500) | có |  |  |
| RawTranscript | nvarchar(max) | có |  |  |
| ExtractedJson | nvarchar(max) | có |  |  |
| ASRProvider | nvarchar(50) | có |  |  |
| LLMModel | nvarchar(50) | có |  |  |
| ProcessingMs | int | có |  |  |
| IsSuccess | bit | không | `1` |  |
| ErrorMessage | nvarchar(1000) | có |  |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK_AI_Processing_Logs` (LogID), clustered

### Classes

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| ClassID | int | không |  | PK, IDENTITY |
| ClassCode | nvarchar(20) | không |  |  |
| ClassName | nvarchar(100) | không |  |  |
| GradeLevel | nvarchar(50) | không |  |  |
| SchoolYear | nvarchar(20) | không |  |  |
| TeacherID | int | có |  | FK → Users.UserID |
| RoomName | nvarchar(50) | có |  |  |
| MaxCapacity | int | không | `30` |  |
| IsActive | bit | không | `1` |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |
| UpdatedAt | datetime2(7) | có |  |  |

Khóa và chỉ mục:

- Khóa chính `PK_Classes` (ClassID), clustered
- Duy nhất `UQ_Classes_Code` (ClassCode, SchoolYear)

### Students

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| StudentID | int | không |  | PK, IDENTITY |
| StudentCode | nvarchar(20) | không |  | UNIQUE |
| FullName | nvarchar(100) | không |  |  |
| Nickname | nvarchar(50) | có |  |  |
| DateOfBirth | date | không |  |  |
| Gender | nvarchar(10) | không |  |  |
| ClassID | int | có |  | FK → Classes.ClassID |
| AllergyHistory | nvarchar(500) | có |  |  |
| HealthNote | nvarchar(500) | có |  |  |
| EnrollmentDate | date | không | `CONVERT([date],sysdatetime())` |  |
| IsActive | bit | không | `1` |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |
| UpdatedAt | datetime2(7) | có |  |  |

Khóa và chỉ mục:

- Khóa chính `PK_Students` (StudentID), clustered
- Duy nhất `UQ_Students_Code` (StudentCode)
- Chỉ mục `IX_Students_ClassID` (ClassID)

Ràng buộc CHECK:

- `CK_Students_Gender`: `[Gender]=N'Other' OR [Gender]=N'Female' OR [Gender]=N'Male'`

### Attendance

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| AttendanceID | int | không |  | PK, IDENTITY |
| StudentID | int | không |  | FK → Students.StudentID |
| ClassID | int | không |  | FK → Classes.ClassID |
| AttendanceDate | date | không |  |  |
| Status | nvarchar(20) | không |  |  |
| Note | nvarchar(255) | có |  |  |
| RecordedBy | int | có |  | FK → Users.UserID |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK_Attendance` (AttendanceID), clustered
- Duy nhất `UQ_Attendance_Student_Date` (StudentID, AttendanceDate)
- Chỉ mục `IX_Attendance_Date_Class` (AttendanceDate, ClassID)

Ràng buộc CHECK:

- `CK_Attendance_Status`: `[Status]=N'Excused' OR [Status]=N'Late' OR [Status]=N'Absent' OR [Status]=N'Present'`

### Audit_Logs

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| AuditID | bigint | không |  | PK, IDENTITY |
| UserID | int | có |  | FK → Users.UserID |
| Action | nvarchar(100) | không |  |  |
| EntityName | nvarchar(50) | có |  |  |
| EntityID | nvarchar(50) | có |  |  |
| Description | nvarchar(1000) | có |  |  |
| IpAddress | nvarchar(45) | có |  |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK_Audit_Logs` (AuditID), clustered
- Chỉ mục `IX_Audit_CreatedAt` (CreatedAt)

### Class_Daily_Summaries

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| SummaryID | int | không |  | PK, IDENTITY |
| ClassID | int | không |  | FK → Classes.ClassID |
| SummaryDate | date | không |  |  |
| GeneralMeal | nvarchar(255) | có |  |  |
| GeneralSleep | nvarchar(255) | có |  |  |
| GeneralStudy | nvarchar(255) | có |  |  |
| GeneralPlay | nvarchar(255) | có |  |  |
| GeneralHealth | nvarchar(255) | có |  |  |
| GeneralMood | nvarchar(255) | có |  |  |
| TotalStudents | int | có |  |  |
| PresentCount | int | có |  |  |
| AbsentCount | int | có |  |  |
| CreatedBy | int | có |  | FK → Users.UserID |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |
| UpdatedAt | datetime2(7) | có |  |  |

Khóa và chỉ mục:

- Khóa chính `PK_Class_Daily_Summaries` (SummaryID), clustered
- Duy nhất `UQ_CDS_Class_Date` (ClassID, SummaryDate)

### Daily_Journals

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| JournalID | int | không |  | PK, IDENTITY |
| StudentID | int | không |  | FK → Students.StudentID |
| ClassID | int | không |  | FK → Classes.ClassID |
| JournalDate | date | không |  |  |
| MealDetail | nvarchar(500) | có |  |  |
| SleepDetail | nvarchar(500) | có |  |  |
| StudyDetail | nvarchar(500) | có |  |  |
| PlayDetail | nvarchar(500) | có |  |  |
| HealthDetail | nvarchar(500) | có |  |  |
| EmotionDetail | nvarchar(500) | có |  |  |
| Symptoms | nvarchar(500) | có |  |  |
| Status | nvarchar(20) | không | `N'DRAFT'` |  |
| IsException | bit | không | `0` |  |
| InputMethod | nvarchar(20) | có |  |  |
| RawTranscript | nvarchar(max) | có |  |  |
| AIJsonResult | nvarchar(max) | có |  |  |
| CreatedBy | int | có |  | FK → Users.UserID |
| ApprovedBy | int | có |  | FK → Users.UserID |
| ApprovedAt | datetime2(7) | có |  |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |
| UpdatedAt | datetime2(7) | có |  |  |

Khóa và chỉ mục:

- Khóa chính `PK_Daily_Journals` (JournalID), clustered
- Duy nhất `UQ_DJ_Student_Date` (StudentID, JournalDate)
- Chỉ mục `IX_DJ_Date_Class` (JournalDate, ClassID)
- Chỉ mục `IX_DJ_Status` (Status)

Ràng buộc CHECK:

- `CK_DJ_InputMethod`: `[InputMethod] IS NULL OR ([InputMethod]=N'BULK' OR [InputMethod]=N'MANUAL' OR [InputMethod]=N'VOICE')`
- `CK_DJ_Status`: `[Status]=N'REJECTED' OR [Status]=N'APPROVED' OR [Status]=N'DRAFT'`

Trigger: `trg_DailyJournals_NotifyParent`, `trg_DailyJournals_UpdatedAt`

### Feedbacks

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| FeedbackID | int | không |  | PK, IDENTITY |
| JournalID | int | không |  | FK → Daily_Journals.JournalID |
| ParentID | int | không |  | FK → Users.UserID |
| Content | nvarchar(1000) | có |  |  |
| IsRead | bit | không | `0` |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK_Feedbacks` (FeedbackID), clustered

### Journal_Photos

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| PhotoID | int | không |  | PK, IDENTITY |
| JournalID | int | có |  | FK → Daily_Journals.JournalID |
| SummaryID | int | có |  | FK → Class_Daily_Summaries.SummaryID |
| ClassID | int | không |  | FK → Classes.ClassID |
| PhotoUrl | nvarchar(500) | không |  |  |
| Caption | nvarchar(255) | có |  |  |
| IsApproved | bit | không | `0` |  |
| UploadedBy | int | có |  | FK → Users.UserID |
| UploadedAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK_Journal_Photos` (PhotoID), clustered
- Chỉ mục `IX_JP_JournalID` (JournalID)
- Chỉ mục `IX_JP_SummaryID` (SummaryID)

Ràng buộc CHECK:

- `CK_JP_Reference`: `[JournalID] IS NOT NULL OR [SummaryID] IS NOT NULL`

### Notifications

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| NotificationID | int | không |  | PK, IDENTITY |
| UserID | int | không |  | FK → Users.UserID |
| StudentID | int | có |  | FK → Students.StudentID |
| JournalID | int | có |  | FK → Daily_Journals.JournalID |
| Title | nvarchar(200) | không |  |  |
| Content | nvarchar(1000) | có |  |  |
| Type | nvarchar(30) | không |  |  |
| IsRead | bit | không | `0` |  |
| ReadAt | datetime2(7) | có |  |  |
| SentAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK_Notifications` (NotificationID), clustered
- Chỉ mục `IX_Noti_User_IsRead` (UserID, IsRead)

Ràng buộc CHECK:

- `CK_Noti_Type`: `[Type]=N'FEEDBACK' OR [Type]=N'SYSTEM' OR [Type]=N'HEALTH_ALERT' OR [Type]=N'JOURNAL_NEW'`

### Parent_Student_Map

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| MapID | int | không |  | PK, IDENTITY |
| ParentID | int | không |  | FK → Users.UserID |
| StudentID | int | không |  | FK → Students.StudentID |
| Relationship | nvarchar(30) | không |  |  |
| IsPrimary | bit | không | `0` |  |
| CanPickup | bit | không | `1` |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK_Parent_Student_Map` (MapID), clustered
- Duy nhất `UQ_PSM_Parent_Student` (ParentID, StudentID)
- Chỉ mục `IX_PSM_StudentID` (StudentID)

Ràng buộc CHECK:

- `CK_PSM_Relationship`: `[Relationship]=N'Khác' OR [Relationship]=N'Người giám hộ' OR [Relationship]=N'Bà' OR [Relationship]=N'Ông' OR [Relationship]=N'Mẹ' OR [Relationship]=N'Cha'`

### Schools

| Cột | Kiểu | Null | Mặc định | Ghi chú |
| --- | --- | --- | --- | --- |
| SchoolID | int | không |  | PK, IDENTITY |
| SchoolCode | nvarchar(20) | không |  | UNIQUE |
| SchoolName | nvarchar(200) | không |  |  |
| Address | nvarchar(300) | có |  |  |
| Phone | nvarchar(15) | có |  |  |
| Email | nvarchar(150) | có |  |  |
| PrincipalID | int | có |  |  |
| IsActive | bit | không | `1` |  |
| CreatedAt | datetime2(7) | không | `sysdatetime()` |  |

Khóa và chỉ mục:

- Khóa chính `PK__Schools__3DA4677BD289A7CB` (SchoolID), clustered
- Duy nhất `UQ__Schools__38CCE1FA748D34F2` (SchoolCode)

## View

### vw_ClassJournalProgress

```sql
-- ============================================================
-- 13. VIEWS
-- ============================================================
CREATE VIEW vw_ClassJournalProgress AS
SELECT
    c.ClassID, c.ClassCode, c.ClassName, c.SchoolYear,
    dj.JournalDate,
    COUNT(DISTINCT s.StudentID) AS TotalStudents,
    COUNT(DISTINCT CASE WHEN dj.Status = N'APPROVED' THEN dj.StudentID END) AS ApprovedCount,
    COUNT(DISTINCT CASE WHEN dj.Status = N'DRAFT'    THEN dj.StudentID END) AS DraftCount,
    CAST(
        100.0 * COUNT(DISTINCT CASE WHEN dj.Status = N'APPROVED' THEN dj.StudentID END)
        / NULLIF(COUNT(DISTINCT s.StudentID), 0)
    AS DECIMAL(5,2)) AS CompletionRate
FROM Classes c
LEFT JOIN Students s        ON s.ClassID = c.ClassID AND s.IsActive = 1
LEFT JOIN Daily_Journals dj ON dj.StudentID = s.StudentID
GROUP BY c.ClassID, c.ClassCode, c.ClassName, c.SchoolYear, dj.JournalDate;
```

### vw_ParentJournalView

```sql
CREATE VIEW vw_ParentJournalView AS
SELECT
    dj.JournalID, dj.JournalDate,
    s.StudentID, s.FullName AS StudentName, s.Nickname,
    c.ClassID, c.ClassName,
    dj.MealDetail, dj.SleepDetail, dj.StudyDetail, dj.PlayDetail,
    dj.HealthDetail, dj.EmotionDetail, dj.Symptoms,
    dj.Status, dj.ApprovedAt,
    u.FullName AS TeacherName
FROM Daily_Journals dj
JOIN Students s ON s.StudentID = dj.StudentID
JOIN Classes  c ON c.ClassID   = dj.ClassID
LEFT JOIN Users u ON u.UserID  = dj.ApprovedBy
WHERE dj.Status = N'APPROVED';
```

## Stored procedure

### sp_BulkCreateJournals

```sql
CREATE PROCEDURE sp_BulkCreateJournals
    @ClassID        INT,
    @JournalDate    DATE,
    @MealDetail     NVARCHAR(500) = NULL,
    @SleepDetail    NVARCHAR(500) = NULL,
    @StudyDetail    NVARCHAR(500) = NULL,
    @PlayDetail     NVARCHAR(500) = NULL,
    @HealthDetail   NVARCHAR(500) = NULL,
    @EmotionDetail  NVARCHAR(500) = NULL,
    @CreatedBy      INT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO Daily_Journals
        (StudentID, ClassID, JournalDate, MealDetail, SleepDetail,
         StudyDetail, PlayDetail, HealthDetail, EmotionDetail,
         Status, InputMethod, CreatedBy)
    SELECT
        a.StudentID, @ClassID, @JournalDate,
        @MealDetail, @SleepDetail, @StudyDetail, @PlayDetail,
        @HealthDetail, @EmotionDetail,
        N'DRAFT', N'BULK', @CreatedBy
    FROM Attendance a
    WHERE a.ClassID = @ClassID
      AND a.AttendanceDate = @JournalDate
      AND a.Status IN (N'Present', N'Late')
      AND NOT EXISTS (
          SELECT 1 FROM Daily_Journals dj
          WHERE dj.StudentID = a.StudentID AND dj.JournalDate = @JournalDate
      );
    SELECT @@ROWCOUNT AS InsertedCount;
END
```

### sp_GetClassJournalsByDate

```sql
-- ============================================================
-- 14. STORED PROCEDURES
-- ============================================================
CREATE PROCEDURE sp_GetClassJournalsByDate
    @ClassID INT,
    @Date    DATE
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        s.StudentID, s.StudentCode, s.FullName, s.Nickname,
        a.Status AS AttendanceStatus,
        dj.JournalID, dj.MealDetail, dj.SleepDetail, dj.StudyDetail,
        dj.PlayDetail, dj.HealthDetail, dj.EmotionDetail, dj.Symptoms,
        dj.Status AS JournalStatus, dj.IsException
    FROM Students s
    LEFT JOIN Attendance a      ON a.StudentID = s.StudentID AND a.AttendanceDate = @Date
    LEFT JOIN Daily_Journals dj ON dj.StudentID = s.StudentID AND dj.JournalDate = @Date
    WHERE s.ClassID = @ClassID AND s.IsActive = 1
    ORDER BY s.FullName;
END
```

## Trigger

### trg_DailyJournals_NotifyParent

```sql
CREATE TRIGGER trg_DailyJournals_NotifyParent
ON Daily_Journals AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO Notifications (UserID, StudentID, JournalID, Title, Content, Type)
    SELECT
        psm.ParentID, i.StudentID, i.JournalID,
        N'Nhật ký mới của bé',
        N'Bé ' + s.FullName + N' vừa có nhật ký ngày '
            + CONVERT(NVARCHAR(10), i.JournalDate, 103) + N'.',
        N'JOURNAL_NEW'
    FROM inserted i
    JOIN deleted d ON d.JournalID = i.JournalID
    JOIN Students s ON s.StudentID = i.StudentID
    JOIN Parent_Student_Map psm ON psm.StudentID = i.StudentID
    WHERE i.Status = N'APPROVED' AND d.Status <> N'APPROVED';
END
```

### trg_DailyJournals_UpdatedAt

```sql
CREATE TRIGGER trg_DailyJournals_UpdatedAt
ON Daily_Journals AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Daily_Journals SET UpdatedAt = SYSDATETIME()
    FROM Daily_Journals dj INNER JOIN inserted i ON dj.JournalID = i.JournalID;
END
```

### trg_Users_UpdatedAt

```sql
-- ============================================================
-- 15. TRIGGERS
-- ============================================================
CREATE TRIGGER trg_Users_UpdatedAt
ON Users AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET UpdatedAt = SYSDATETIME()
    FROM Users u INNER JOIN inserted i ON u.UserID = i.UserID;
END
```
