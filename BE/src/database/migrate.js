require('dotenv').config();
const { getPool, sql } = require('./db');

const MIGRATION_SQL = `
-- ============================================================
-- KinderLog Database Schema
-- SQL Server 2022
-- ============================================================

-- Drop database if exists and recreate
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'KinderLogDB')
BEGIN
  CREATE DATABASE KinderLogDB;
END
GO

USE KinderLogDB;
GO

-- ============================================================
-- TABLE: Schools
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Schools' AND xtype='U')
CREATE TABLE Schools (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name        NVARCHAR(200) NOT NULL,
  Address     NVARCHAR(300),
  Phone       NVARCHAR(20),
  Email       NVARCHAR(100),
  PrincipalId NVARCHAR(50),
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Active', -- Active | Inactive | Locked
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  UpdatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE())
);

-- ============================================================
-- TABLE: Admins
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Admins' AND xtype='U')
CREATE TABLE Admins (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name        NVARCHAR(200) NOT NULL,
  Phone       NVARCHAR(20)  NOT NULL UNIQUE,
  Email       NVARCHAR(100),
  PasswordHash NVARCHAR(255) NOT NULL,
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  LastLogin   BIGINT,
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  UpdatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE())
);

-- ============================================================
-- TABLE: Principals
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Principals' AND xtype='U')
CREATE TABLE Principals (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name        NVARCHAR(200) NOT NULL,
  Phone       NVARCHAR(20)  NOT NULL UNIQUE,
  Email       NVARCHAR(100),
  PasswordHash NVARCHAR(255) NOT NULL,
  SchoolId    NVARCHAR(50),
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  LastLogin   BIGINT,
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  UpdatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (SchoolId) REFERENCES Schools(Id)
);

-- ============================================================
-- TABLE: Teachers
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Teachers' AND xtype='U')
CREATE TABLE Teachers (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name        NVARCHAR(200) NOT NULL,
  Phone       NVARCHAR(20)  NOT NULL UNIQUE,
  Email       NVARCHAR(100),
  PasswordHash NVARCHAR(255) NOT NULL,
  SchoolId    NVARCHAR(50),
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  Photo       NVARCHAR(500),
  LastLogin   BIGINT,
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  UpdatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (SchoolId) REFERENCES Schools(Id)
);

-- ============================================================
-- TABLE: AcademicYears
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AcademicYears' AND xtype='U')
CREATE TABLE AcademicYears (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name        NVARCHAR(100) NOT NULL,
  StartDate   NVARCHAR(10)  NOT NULL, -- ISO YYYY-MM-DD
  EndDate     NVARCHAR(10)  NOT NULL,
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Current', -- Current | Archived
  SchoolId    NVARCHAR(50)  NOT NULL,
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (SchoolId) REFERENCES Schools(Id)
);

-- ============================================================
-- TABLE: Classes
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Classes' AND xtype='U')
CREATE TABLE Classes (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name        NVARCHAR(200) NOT NULL,
  YearId      NVARCHAR(50)  NOT NULL,
  TeacherId   NVARCHAR(50),
  SchoolId    NVARCHAR(50)  NOT NULL,
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (YearId) REFERENCES AcademicYears(Id),
  FOREIGN KEY (TeacherId) REFERENCES Teachers(Id),
  FOREIGN KEY (SchoolId) REFERENCES Schools(Id)
);

-- ============================================================
-- TABLE: Students
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Students' AND xtype='U')
CREATE TABLE Students (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name        NVARCHAR(200) NOT NULL,
  Dob         NVARCHAR(10),  -- YYYY-MM-DD
  Gender      NVARCHAR(10),  -- Male | Female
  ClassId     NVARCHAR(50),
  SchoolId    NVARCHAR(50),
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  Note        NVARCHAR(MAX),
  Photo       NVARCHAR(500),
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  UpdatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (ClassId) REFERENCES Classes(Id),
  FOREIGN KEY (SchoolId) REFERENCES Schools(Id)
);

-- ============================================================
-- TABLE: Parents
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Parents' AND xtype='U')
CREATE TABLE Parents (
  Id           NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name         NVARCHAR(200) NOT NULL,
  Phone        NVARCHAR(20)  NOT NULL UNIQUE,
  Email        NVARCHAR(100),
  Address      NVARCHAR(300),
  PasswordHash NVARCHAR(255) NOT NULL,
  CameraAccess BIT           NOT NULL DEFAULT 1,
  Status       NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  LastLogin    BIGINT,
  CreatedAt    BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  UpdatedAt    BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE())
);

-- ============================================================
-- TABLE: ParentStudentLinks
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ParentStudentLinks' AND xtype='U')
CREATE TABLE ParentStudentLinks (
  Id           NVARCHAR(50)  NOT NULL PRIMARY KEY,
  ParentId     NVARCHAR(50)  NOT NULL,
  StudentId    NVARCHAR(50)  NOT NULL,
  Relationship NVARCHAR(50)  NOT NULL, -- Mother | Father | Grandfather | Grandmother
  Status       NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  CreatedAt    BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (ParentId)  REFERENCES Parents(Id),
  FOREIGN KEY (StudentId) REFERENCES Students(Id)
);

-- ============================================================
-- TABLE: Cameras
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Cameras' AND xtype='U')
CREATE TABLE Cameras (
  Id       NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Name     NVARCHAR(100) NOT NULL,
  ClassId  NVARCHAR(50)  NOT NULL,
  StreamUrl NVARCHAR(500),
  Status   NVARCHAR(20)  NOT NULL DEFAULT 'Active',
  FOREIGN KEY (ClassId) REFERENCES Classes(Id)
);

-- ============================================================
-- TABLE: CameraSchedules
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CameraSchedules' AND xtype='U')
CREATE TABLE CameraSchedules (
  Id       NVARCHAR(50)  NOT NULL PRIMARY KEY,
  ClassId  NVARCHAR(50)  NOT NULL,
  CameraId NVARCHAR(50)  NOT NULL,
  Date     NVARCHAR(10)  NOT NULL, -- YYYY-MM-DD
  StartTime NVARCHAR(5)  NOT NULL, -- HH:MM
  EndTime  NVARCHAR(5)   NOT NULL, -- HH:MM
  Enabled  BIT           NOT NULL DEFAULT 1,
  CreatedAt BIGINT       NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (ClassId)  REFERENCES Classes(Id),
  FOREIGN KEY (CameraId) REFERENCES Cameras(Id)
);

-- ============================================================
-- TABLE: Attendance
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Attendance' AND xtype='U')
CREATE TABLE Attendance (
  Id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
  ClassId   NVARCHAR(50)  NOT NULL,
  StudentId NVARCHAR(50)  NOT NULL,
  Date      NVARCHAR(10)  NOT NULL, -- YYYY-MM-DD
  Status    NVARCHAR(20)  NOT NULL, -- present | absent
  Note      NVARCHAR(500),
  SavedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (ClassId)   REFERENCES Classes(Id),
  FOREIGN KEY (StudentId) REFERENCES Students(Id),
  CONSTRAINT UQ_Attendance UNIQUE (ClassId, StudentId, Date)
);

-- ============================================================
-- TABLE: Journals
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Journals' AND xtype='U')
CREATE TABLE Journals (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  ClassId     NVARCHAR(50)  NOT NULL,
  Date        NVARCHAR(10)  NOT NULL,
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'draft', -- draft | published
  Source      NVARCHAR(20)  NOT NULL DEFAULT 'manual', -- manual | voice
  Meal        NVARCHAR(MAX),
  Learning    NVARCHAR(MAX),
  Sleep       NVARCHAR(MAX),
  Health      NVARCHAR(MAX),
  Emotion     NVARCHAR(MAX),
  Note        NVARCHAR(MAX),
  Photos      NVARCHAR(MAX), -- JSON array of photo URLs
  UpdatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  PublishedAt BIGINT,
  FOREIGN KEY (ClassId) REFERENCES Classes(Id),
  CONSTRAINT UQ_Journal UNIQUE (ClassId, Date)
);

-- ============================================================
-- TABLE: Messages
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Messages' AND xtype='U')
CREATE TABLE Messages (
  Id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
  ParentId  NVARCHAR(50)  NOT NULL,
  TeacherId NVARCHAR(50)  NOT NULL,
  FromRole  NVARCHAR(20)  NOT NULL, -- parent | teacher
  Text      NVARCHAR(MAX) NOT NULL,
  IsRead    BIT           NOT NULL DEFAULT 0,
  SentAt    BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (ParentId)  REFERENCES Parents(Id),
  FOREIGN KEY (TeacherId) REFERENCES Teachers(Id)
);

-- ============================================================
-- TABLE: Announcements
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Announcements' AND xtype='U')
CREATE TABLE Announcements (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Title       NVARCHAR(300) NOT NULL,
  Content     NVARCHAR(MAX) NOT NULL,
  Audience    NVARCHAR(100) NOT NULL, -- Teachers & Parents | Parents | Teachers
  Category    NVARCHAR(50)  NOT NULL,
  PublishDate NVARCHAR(10)  NOT NULL,
  ExpiryDate  NVARCHAR(10),
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Draft', -- Draft | Published | Archived
  SchoolId    NVARCHAR(50),
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  UpdatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  FOREIGN KEY (SchoolId) REFERENCES Schools(Id)
);

-- ============================================================
-- TABLE: Notifications
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')
CREATE TABLE Notifications (
  Id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
  Role      NVARCHAR(20)  NOT NULL, -- parent | teacher | principal
  UserId    NVARCHAR(50),           -- NULL = broadcast to all of that role
  ClassId   NVARCHAR(50),
  Type      NVARCHAR(50)  NOT NULL, -- announcement | journal | camera | message | system
  Title     NVARCHAR(300) NOT NULL,
  Body      NVARCHAR(MAX),
  SentAt    BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE())
);

-- ============================================================
-- TABLE: NotificationReads
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')
CREATE TABLE NotificationReads (
  NotificationId NVARCHAR(50) NOT NULL,
  UserId         NVARCHAR(50) NOT NULL,
  ReadAt         BIGINT NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE()),
  PRIMARY KEY (NotificationId, UserId)
);

-- ============================================================
-- TABLE: AuditLogs
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AuditLogs' AND xtype='U')
CREATE TABLE AuditLogs (
  Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
  UserId      NVARCHAR(50),
  UserName    NVARCHAR(200),
  UserRole    NVARCHAR(50),
  Action      NVARCHAR(100) NOT NULL,
  Module      NVARCHAR(100) NOT NULL,
  Description NVARCHAR(MAX),
  Status      NVARCHAR(20)  NOT NULL DEFAULT 'Success',
  CreatedAt   BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE())
);

-- ============================================================
-- TABLE: SystemSettings
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
CREATE TABLE SystemSettings (
  SettingKey   NVARCHAR(100) NOT NULL PRIMARY KEY,
  SettingValue NVARCHAR(MAX) NOT NULL,
  UpdatedAt    BIGINT        NOT NULL DEFAULT DATEDIFF(MILLISECOND, '1970-01-01', GETUTCDATE())
);
`;

async function runMigration() {
  try {
    console.log('🔄 Running database migration...');
    const pool = await getPool();

    // Split by GO statements and execute each batch
    const batches = MIGRATION_SQL.split(/\bGO\b/i).filter(b => b.trim());
    for (const batch of batches) {
      if (batch.trim()) {
        await pool.request().query(batch);
      }
    }

    console.log('✅ Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
