// The views, stored procedures and triggers of the school's backup (BackUp/C2SE10_KinderLog_new.bak),
// word for word. They work on the per-child Daily_Journals of the original design.

export const VIEWS = {
  vw_ClassJournalProgress: `
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
GROUP BY c.ClassID, c.ClassCode, c.ClassName, c.SchoolYear, dj.JournalDate;`,

  vw_ParentJournalView: `
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
WHERE dj.Status = N'APPROVED';`,
}

export const PROCEDURES = {
  sp_GetClassJournalsByDate: `
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
END`,

  sp_BulkCreateJournals: `
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
END`,
}

// `now` is the function that stamps UpdatedAt: SYSDATETIME() in the backup, SYSUTCDATETIME() from migration 002.
export const updatedAtTriggers = (now) => ({
  trg_Users_UpdatedAt: `
TRIGGER trg_Users_UpdatedAt
ON Users AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Users SET UpdatedAt = ${now}
    FROM Users u INNER JOIN inserted i ON u.UserID = i.UserID;
END`,

  trg_DailyJournals_UpdatedAt: `
TRIGGER trg_DailyJournals_UpdatedAt
ON Daily_Journals AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Daily_Journals SET UpdatedAt = ${now}
    FROM Daily_Journals dj INNER JOIN inserted i ON dj.JournalID = i.JournalID;
END`,
})

export const NOTIFY_TRIGGER = {
  trg_DailyJournals_NotifyParent: `
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
END`,
}
