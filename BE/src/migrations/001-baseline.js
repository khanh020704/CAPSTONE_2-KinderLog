// The school's database as delivered in BackUp/C2SE10_KinderLog_new.bak: 13 tables with their keys,
// relations, defaults and checks, 2 views, 2 stored procedures and 3 triggers. On the restored backup
// everything exists and nothing changes; on an empty database the same structure is created, so later
// migrations always start from the same point. (The diagram procedures SSMS adds are not part of it.)
import { exec } from '../db/sql.js'
import { NOTIFY_TRIGGER, PROCEDURES, VIEWS, updatedAtTriggers } from './lib/baseline-objects.js'
import { batches, createObject, createTable, dropObject, dropTable, oneOf } from './lib/tsql.js'

const now = 'DEFAULT SYSDATETIME()'

export const TABLES = [
  'Users',
  'Schools',
  'Classes',
  'Students',
  'Parent_Student_Map',
  'Attendance',
  'Class_Daily_Summaries',
  'Daily_Journals',
  'Feedbacks',
  'Journal_Photos',
  'Notifications',
  'AI_Processing_Logs',
  'Audit_Logs',
]

export async function up() {
  await exec(
    batches(
      createTable(
        'Users',
        `
        UserID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
        Username nvarchar(50) NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
        PasswordHash nvarchar(255) NOT NULL,
        FullName nvarchar(100) NOT NULL,
        Email nvarchar(150) NULL CONSTRAINT UQ_Users_Email UNIQUE,
        PhoneNumber nvarchar(15) NULL,
        Role nvarchar(20) NOT NULL CONSTRAINT CK_Users_Role CHECK (${oneOf('Role', ['ADMIN', 'TEACHER', 'PARENT'])}),
        AvatarUrl nvarchar(500) NULL,
        IsActive bit NOT NULL DEFAULT 1,
        LastLoginAt datetime2 NULL,
        CreatedAt datetime2 NOT NULL ${now},
        UpdatedAt datetime2 NULL`,
      ),
      createTable(
        'Schools',
        `
        SchoolID int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SchoolCode nvarchar(20) NOT NULL UNIQUE,
        SchoolName nvarchar(200) NOT NULL,
        Address nvarchar(300) NULL,
        Phone nvarchar(15) NULL,
        Email nvarchar(150) NULL,
        PrincipalID int NULL,
        IsActive bit NOT NULL DEFAULT 1,
        CreatedAt datetime2 NOT NULL ${now}`,
      ),
      createTable(
        'Classes',
        `
        ClassID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Classes PRIMARY KEY,
        ClassCode nvarchar(20) NOT NULL,
        ClassName nvarchar(100) NOT NULL,
        GradeLevel nvarchar(50) NOT NULL,
        SchoolYear nvarchar(20) NOT NULL,
        TeacherID int NULL CONSTRAINT FK_Classes_Teacher REFERENCES dbo.Users(UserID) ON DELETE SET NULL,
        RoomName nvarchar(50) NULL,
        MaxCapacity int NOT NULL DEFAULT 30,
        IsActive bit NOT NULL DEFAULT 1,
        CreatedAt datetime2 NOT NULL ${now},
        UpdatedAt datetime2 NULL,
        CONSTRAINT UQ_Classes_Code UNIQUE (ClassCode, SchoolYear)`,
      ),
      createTable(
        'Students',
        `
        StudentID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Students PRIMARY KEY,
        StudentCode nvarchar(20) NOT NULL CONSTRAINT UQ_Students_Code UNIQUE,
        FullName nvarchar(100) NOT NULL,
        Nickname nvarchar(50) NULL,
        DateOfBirth date NOT NULL,
        Gender nvarchar(10) NOT NULL CONSTRAINT CK_Students_Gender CHECK (${oneOf('Gender', ['Male', 'Female', 'Other'])}),
        ClassID int NULL CONSTRAINT FK_Students_Class REFERENCES dbo.Classes(ClassID) ON DELETE SET NULL,
        AllergyHistory nvarchar(500) NULL,
        HealthNote nvarchar(500) NULL,
        EnrollmentDate date NOT NULL DEFAULT CONVERT(date, SYSDATETIME()),
        IsActive bit NOT NULL DEFAULT 1,
        CreatedAt datetime2 NOT NULL ${now},
        UpdatedAt datetime2 NULL,
        INDEX IX_Students_ClassID (ClassID)`,
      ),
      createTable(
        'Parent_Student_Map',
        `
        MapID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Parent_Student_Map PRIMARY KEY,
        ParentID int NOT NULL CONSTRAINT FK_PSM_Parent REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
        StudentID int NOT NULL CONSTRAINT FK_PSM_Student REFERENCES dbo.Students(StudentID) ON DELETE CASCADE,
        Relationship nvarchar(30) NOT NULL CONSTRAINT CK_PSM_Relationship CHECK (${oneOf('Relationship', ['Cha', 'Mẹ', 'Ông', 'Bà', 'Người giám hộ', 'Khác'])}),
        IsPrimary bit NOT NULL DEFAULT 0,
        CanPickup bit NOT NULL DEFAULT 1,
        CreatedAt datetime2 NOT NULL ${now},
        CONSTRAINT UQ_PSM_Parent_Student UNIQUE (ParentID, StudentID),
        INDEX IX_PSM_StudentID (StudentID)`,
      ),
      createTable(
        'Attendance',
        `
        AttendanceID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Attendance PRIMARY KEY,
        StudentID int NOT NULL CONSTRAINT FK_Attendance_Student REFERENCES dbo.Students(StudentID) ON DELETE CASCADE,
        ClassID int NOT NULL CONSTRAINT FK_Attendance_Class REFERENCES dbo.Classes(ClassID),
        AttendanceDate date NOT NULL,
        Status nvarchar(20) NOT NULL CONSTRAINT CK_Attendance_Status CHECK (${oneOf('Status', ['Present', 'Absent', 'Late', 'Excused'])}),
        Note nvarchar(255) NULL,
        RecordedBy int NULL CONSTRAINT FK_Attendance_Teacher REFERENCES dbo.Users(UserID),
        CreatedAt datetime2 NOT NULL ${now},
        CONSTRAINT UQ_Attendance_Student_Date UNIQUE (StudentID, AttendanceDate),
        INDEX IX_Attendance_Date_Class (AttendanceDate, ClassID)`,
      ),
      createTable(
        'Class_Daily_Summaries',
        `
        SummaryID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Class_Daily_Summaries PRIMARY KEY,
        ClassID int NOT NULL CONSTRAINT FK_CDS_Class REFERENCES dbo.Classes(ClassID) ON DELETE CASCADE,
        SummaryDate date NOT NULL,
        GeneralMeal nvarchar(255) NULL,
        GeneralSleep nvarchar(255) NULL,
        GeneralStudy nvarchar(255) NULL,
        GeneralPlay nvarchar(255) NULL,
        GeneralHealth nvarchar(255) NULL,
        GeneralMood nvarchar(255) NULL,
        TotalStudents int NULL,
        PresentCount int NULL,
        AbsentCount int NULL,
        CreatedBy int NULL CONSTRAINT FK_CDS_Teacher REFERENCES dbo.Users(UserID),
        CreatedAt datetime2 NOT NULL ${now},
        UpdatedAt datetime2 NULL,
        CONSTRAINT UQ_CDS_Class_Date UNIQUE (ClassID, SummaryDate)`,
      ),
      createTable(
        'Daily_Journals',
        `
        JournalID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Daily_Journals PRIMARY KEY,
        StudentID int NOT NULL CONSTRAINT FK_DJ_Student REFERENCES dbo.Students(StudentID) ON DELETE CASCADE,
        ClassID int NOT NULL CONSTRAINT FK_DJ_Class REFERENCES dbo.Classes(ClassID),
        JournalDate date NOT NULL,
        MealDetail nvarchar(500) NULL,
        SleepDetail nvarchar(500) NULL,
        StudyDetail nvarchar(500) NULL,
        PlayDetail nvarchar(500) NULL,
        HealthDetail nvarchar(500) NULL,
        EmotionDetail nvarchar(500) NULL,
        Symptoms nvarchar(500) NULL,
        Status nvarchar(20) NOT NULL DEFAULT N'DRAFT' CONSTRAINT CK_DJ_Status CHECK (${oneOf('Status', ['DRAFT', 'APPROVED', 'REJECTED'])}),
        IsException bit NOT NULL DEFAULT 0,
        InputMethod nvarchar(20) NULL CONSTRAINT CK_DJ_InputMethod CHECK (${oneOf('InputMethod', ['VOICE', 'MANUAL', 'BULK'], true)}),
        RawTranscript nvarchar(max) NULL,
        AIJsonResult nvarchar(max) NULL,
        CreatedBy int NULL CONSTRAINT FK_DJ_CreatedBy REFERENCES dbo.Users(UserID),
        ApprovedBy int NULL CONSTRAINT FK_DJ_ApprovedBy REFERENCES dbo.Users(UserID),
        ApprovedAt datetime2 NULL,
        CreatedAt datetime2 NOT NULL ${now},
        UpdatedAt datetime2 NULL,
        CONSTRAINT UQ_DJ_Student_Date UNIQUE (StudentID, JournalDate),
        INDEX IX_DJ_Date_Class (JournalDate, ClassID),
        INDEX IX_DJ_Status (Status)`,
      ),
      createTable(
        'Feedbacks',
        `
        FeedbackID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Feedbacks PRIMARY KEY,
        JournalID int NOT NULL CONSTRAINT FK_FB_Journal REFERENCES dbo.Daily_Journals(JournalID) ON DELETE CASCADE,
        ParentID int NOT NULL CONSTRAINT FK_FB_Parent REFERENCES dbo.Users(UserID),
        Content nvarchar(1000) NULL,
        IsRead bit NOT NULL DEFAULT 0,
        CreatedAt datetime2 NOT NULL ${now}`,
      ),
      createTable(
        'Journal_Photos',
        `
        PhotoID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Journal_Photos PRIMARY KEY,
        JournalID int NULL CONSTRAINT FK_JP_Journal REFERENCES dbo.Daily_Journals(JournalID) ON DELETE CASCADE,
        SummaryID int NULL CONSTRAINT FK_JP_Summary REFERENCES dbo.Class_Daily_Summaries(SummaryID),
        ClassID int NOT NULL CONSTRAINT FK_JP_Class REFERENCES dbo.Classes(ClassID),
        PhotoUrl nvarchar(500) NOT NULL,
        Caption nvarchar(255) NULL,
        IsApproved bit NOT NULL DEFAULT 0,
        UploadedBy int NULL CONSTRAINT FK_JP_Uploader REFERENCES dbo.Users(UserID),
        UploadedAt datetime2 NOT NULL ${now},
        CONSTRAINT CK_JP_Reference CHECK (JournalID IS NOT NULL OR SummaryID IS NOT NULL),
        INDEX IX_JP_JournalID (JournalID),
        INDEX IX_JP_SummaryID (SummaryID)`,
      ),
      createTable(
        'Notifications',
        `
        NotificationID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY,
        UserID int NOT NULL CONSTRAINT FK_Noti_User REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
        StudentID int NULL CONSTRAINT FK_Noti_Student REFERENCES dbo.Students(StudentID),
        JournalID int NULL CONSTRAINT FK_Noti_Journal REFERENCES dbo.Daily_Journals(JournalID),
        Title nvarchar(200) NOT NULL,
        Content nvarchar(1000) NULL,
        Type nvarchar(30) NOT NULL CONSTRAINT CK_Noti_Type CHECK (${oneOf('Type', ['JOURNAL_NEW', 'HEALTH_ALERT', 'SYSTEM', 'FEEDBACK'])}),
        IsRead bit NOT NULL DEFAULT 0,
        ReadAt datetime2 NULL,
        SentAt datetime2 NOT NULL ${now},
        INDEX IX_Noti_User_IsRead (UserID, IsRead)`,
      ),
      createTable(
        'AI_Processing_Logs',
        `
        LogID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_AI_Processing_Logs PRIMARY KEY,
        UserID int NULL CONSTRAINT FK_AILog_User REFERENCES dbo.Users(UserID),
        AudioUrl nvarchar(500) NULL,
        RawTranscript nvarchar(max) NULL,
        ExtractedJson nvarchar(max) NULL,
        ASRProvider nvarchar(50) NULL,
        LLMModel nvarchar(50) NULL,
        ProcessingMs int NULL,
        IsSuccess bit NOT NULL DEFAULT 1,
        ErrorMessage nvarchar(1000) NULL,
        CreatedAt datetime2 NOT NULL ${now}`,
      ),
      createTable(
        'Audit_Logs',
        `
        AuditID bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Audit_Logs PRIMARY KEY,
        UserID int NULL CONSTRAINT FK_Audit_User REFERENCES dbo.Users(UserID),
        Action nvarchar(100) NOT NULL,
        EntityName nvarchar(50) NULL,
        EntityID nvarchar(50) NULL,
        Description nvarchar(1000) NULL,
        IpAddress nvarchar(45) NULL,
        CreatedAt datetime2 NOT NULL ${now},
        INDEX IX_Audit_CreatedAt (CreatedAt)`,
      ),
    ),
  )
  const triggers = Object.fromEntries(Object.entries(updatedAtTriggers('SYSDATETIME()')).map(([name, body]) => [name, `CREATE ${body.trim()}`]))
  for (const [name, definition] of Object.entries({ ...VIEWS, ...PROCEDURES, ...triggers, ...NOTIFY_TRIGGER })) {
    await exec(createObject(name, definition))
  }
}

// Removes the school's tables, children first.
export async function down() {
  await exec(
    batches(
      ...Object.keys(VIEWS).map((name) => dropObject(name, 'VIEW')),
      ...Object.keys(PROCEDURES).map((name) => dropObject(name, 'PROCEDURE')),
      ...[...TABLES].reverse().map(dropTable),
    ),
  )
}
