// What the teacher and parent APIs (Md/API2.md) need beyond the school's tables:
//   - Users: IsLocked; phone and email unique only when given (several users may have neither)
//   - Students.PhotoUrl, Parent_Student_Map.IsActive, Attendance.UpdatedAt, Audit_Logs.Status
//   - Notifications.SummaryID and the MESSAGE and ANNOUNCEMENT types
//   - new tables: Messages, System_Settings, Refresh_Tokens, Password_Reset_Tokens
// Timestamps written by default, and by the backup's UpdatedAt triggers, are UTC from now on, like those
// the application writes.
import { exec } from '../db/sql.js'
import { TABLES } from './001-baseline.js'
import { updatedAtTriggers } from './lib/baseline-objects.js'
import {
  addColumn,
  batches,
  createIndex,
  createTable,
  dropColumn,
  dropConstraint,
  dropIndex,
  dropTable,
  oneOf,
  setCheck,
  setDefault,
} from './lib/tsql.js'

const TIMESTAMP_COLUMNS = {
  Users: ['CreatedAt'],
  Schools: ['CreatedAt'],
  Classes: ['CreatedAt'],
  Students: ['CreatedAt'],
  Parent_Student_Map: ['CreatedAt'],
  Attendance: ['CreatedAt'],
  Class_Daily_Summaries: ['CreatedAt'],
  Daily_Journals: ['CreatedAt'],
  Feedbacks: ['CreatedAt'],
  Journal_Photos: ['UploadedAt'],
  Notifications: ['SentAt'],
  AI_Processing_Logs: ['CreatedAt'],
  Audit_Logs: ['CreatedAt'],
}

const NOTIFICATION_TYPES = ['JOURNAL_NEW', 'HEALTH_ALERT', 'SYSTEM', 'FEEDBACK', 'MESSAGE', 'ANNOUNCEMENT']

// The backup's triggers stamp UpdatedAt with `now` (they exist on a restored backup and after migration 001).
async function stampTriggersWith(now) {
  for (const body of Object.values(updatedAtTriggers(now))) await exec(`ALTER ${body.trim()}`)
}

export async function up() {
  await stampTriggersWith('SYSUTCDATETIME()')
  await exec(
    batches(
      ...TABLES.flatMap((table) => TIMESTAMP_COLUMNS[table].map((column) => setDefault(table, column, 'SYSUTCDATETIME()'))),

      addColumn('Users', 'IsLocked', 'bit NOT NULL CONSTRAINT DF_Users_IsLocked DEFAULT 0'),
      dropConstraint('Users', 'UQ_Users_Email'),
      createIndex('UX_Users_Email', 'Users', 'UNIQUE INDEX UX_Users_Email ON dbo.Users(Email) WHERE Email IS NOT NULL'),
      createIndex('UX_Users_Phone', 'Users', 'UNIQUE INDEX UX_Users_Phone ON dbo.Users(PhoneNumber) WHERE PhoneNumber IS NOT NULL'),

      addColumn('Students', 'PhotoUrl', 'nvarchar(500) NULL'),
      addColumn('Parent_Student_Map', 'IsActive', 'bit NOT NULL CONSTRAINT DF_Parent_Student_Map_IsActive DEFAULT 1'),
      addColumn('Attendance', 'UpdatedAt', 'datetime2 NULL'),
      addColumn('Audit_Logs', 'Status', "nvarchar(20) NOT NULL CONSTRAINT DF_Audit_Logs_Status DEFAULT N'Success'"),
      addColumn('Notifications', 'SummaryID', 'int NULL CONSTRAINT FK_Noti_Summary REFERENCES dbo.Class_Daily_Summaries(SummaryID)'),
    ),
  )
  await exec(
    batches(
      setCheck('Audit_Logs', 'CK_Audit_Status', oneOf('Status', ['Success', 'Failed'])),
      setCheck('Notifications', 'CK_Noti_Type', oneOf('Type', NOTIFICATION_TYPES)),

      // One conversation is one (parent, teacher) pair. Text only.
      createTable(
        'Messages',
        `
        MessageID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Messages PRIMARY KEY,
        ParentID int NOT NULL CONSTRAINT FK_Msg_Parent REFERENCES dbo.Users(UserID),
        TeacherID int NOT NULL CONSTRAINT FK_Msg_Teacher REFERENCES dbo.Users(UserID),
        SenderRole nvarchar(10) NOT NULL CONSTRAINT CK_Msg_SenderRole CHECK (${oneOf('SenderRole', ['PARENT', 'TEACHER'])}),
        Content nvarchar(2000) NOT NULL,
        IsRead bit NOT NULL CONSTRAINT DF_Messages_IsRead DEFAULT 0,
        ReadAt datetime2 NULL,
        SentAt datetime2 NOT NULL CONSTRAINT DF_Messages_SentAt DEFAULT SYSUTCDATETIME(),
        INDEX IX_Msg_Pair (ParentID, TeacherID, SentAt),
        INDEX IX_Msg_Teacher_IsRead (TeacherID, IsRead),
        INDEX IX_Msg_Parent_IsRead (ParentID, IsRead)`,
      ),
      // Platform settings as key / JSON value, e.g. ('maxPhotos', '6'). A value may be a single string or number,
      // which ISJSON alone rejects, so the check wraps it in a list.
      createTable(
        'System_Settings',
        `
        SettingKey nvarchar(50) NOT NULL CONSTRAINT PK_System_Settings PRIMARY KEY,
        SettingValue nvarchar(max) NOT NULL CONSTRAINT CK_Settings_Json CHECK (ISJSON(N'[' + SettingValue + N']') = 1),
        UpdatedAt datetime2 NULL`,
      ),
      // Only the SHA-256 hash of a token is stored, never the token itself.
      createTable(
        'Refresh_Tokens',
        `
        TokenID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Refresh_Tokens PRIMARY KEY,
        UserID int NOT NULL CONSTRAINT FK_RT_User REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
        TokenHash nvarchar(128) NOT NULL CONSTRAINT UQ_RT_TokenHash UNIQUE,
        ExpiresAt datetime2 NOT NULL,
        RevokedAt datetime2 NULL,
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_Refresh_Tokens_CreatedAt DEFAULT SYSUTCDATETIME(),
        INDEX IX_RT_User (UserID)`,
      ),
      createTable(
        'Password_Reset_Tokens',
        `
        TokenID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Password_Reset_Tokens PRIMARY KEY,
        UserID int NOT NULL CONSTRAINT FK_PRT_User REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
        TokenHash nvarchar(128) NOT NULL CONSTRAINT UQ_PRT_TokenHash UNIQUE,
        ExpiresAt datetime2 NOT NULL,
        UsedAt datetime2 NULL,
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_Password_Reset_Tokens_CreatedAt DEFAULT SYSUTCDATETIME()`,
      ),
    ),
  )
}

export async function down() {
  await exec(
    batches(
      dropTable('Password_Reset_Tokens'),
      dropTable('Refresh_Tokens'),
      dropTable('System_Settings'),
      dropTable('Messages'),
      `DELETE FROM dbo.Notifications WHERE Type IN (N'MESSAGE', N'ANNOUNCEMENT')`,
      setCheck('Notifications', 'CK_Noti_Type', oneOf('Type', NOTIFICATION_TYPES.slice(0, 4))),
      dropColumn('Notifications', 'SummaryID'),
      dropColumn('Audit_Logs', 'Status'),
      dropColumn('Attendance', 'UpdatedAt'),
      dropColumn('Parent_Student_Map', 'IsActive'),
      dropColumn('Students', 'PhotoUrl'),
      dropIndex('UX_Users_Phone', 'Users'),
      dropIndex('UX_Users_Email', 'Users'),
      `IF OBJECT_ID(N'dbo.UQ_Users_Email', N'UQ') IS NULL ALTER TABLE dbo.Users ADD CONSTRAINT UQ_Users_Email UNIQUE (Email)`,
      dropColumn('Users', 'IsLocked'),
      ...TABLES.flatMap((table) => TIMESTAMP_COLUMNS[table].map((column) => setDefault(table, column, 'SYSDATETIME()'))),
    ),
  )
  await stampTriggersWith('SYSDATETIME()')
}
