// The class journal of Md/API2.md on top of Class_Daily_Summaries:
//   - its workflow: Status DRAFT / REVIEW -> APPROVED -> PUBLISHED, InputMethod, the transcript, approval and publish times
//   - GeneralNote (the note to every parent of the class), and room for longer sections (2000 characters)
//   - Summary_Personal_Notes: a note about one child, shown only to that child's parents
//   - Summary_Audio: the recordings a voice journal was made from
//   - Summary_Review_Issues: points of a voice draft the teacher must confirm before approving
import { exec } from '../db/sql.js'
import { addColumn, batches, createIndex, createTable, dropColumn, dropIndex, dropTable, oneOf, setCheck } from './lib/tsql.js'

const SECTIONS = ['GeneralMeal', 'GeneralSleep', 'GeneralStudy', 'GeneralPlay', 'GeneralHealth', 'GeneralMood']
const ISSUE_TYPES = ['unknown_student', 'ambiguous_student', 'name_mismatch', 'missing_student', 'child_named_in_class_text', 'contradiction', 'unclear', 'health_alert', 'unsupported_content']
const SECTION_KEYS = ['meal', 'learning', 'sleep', 'health', 'emotion', 'note']
const json = (column) => `nvarchar(max) NOT NULL CONSTRAINT DF_SRI_${column} DEFAULT N'[]' CONSTRAINT CK_SRI_${column} CHECK (ISJSON(${column}) = 1)`

export async function up() {
  await exec(
    batches(
      ...SECTIONS.map((column) => `ALTER TABLE dbo.Class_Daily_Summaries ALTER COLUMN ${column} nvarchar(2000) NULL`),
      addColumn('Class_Daily_Summaries', 'GeneralNote', 'nvarchar(2000) NULL'),
      addColumn('Class_Daily_Summaries', 'Status', "nvarchar(20) NOT NULL CONSTRAINT DF_CDS_Status DEFAULT N'DRAFT'"),
      addColumn('Class_Daily_Summaries', 'InputMethod', 'nvarchar(20) NULL'),
      addColumn('Class_Daily_Summaries', 'RawTranscript', 'nvarchar(max) NULL'),
      addColumn('Class_Daily_Summaries', 'ApprovedAt', 'datetime2 NULL'),
      addColumn('Class_Daily_Summaries', 'PublishedAt', 'datetime2 NULL'),
    ),
  )
  await exec(
    batches(
      setCheck('Class_Daily_Summaries', 'CK_CDS_Status', oneOf('Status', ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED'])),
      setCheck('Class_Daily_Summaries', 'CK_CDS_InputMethod', oneOf('InputMethod', ['MANUAL', 'VOICE'], true)),
      createIndex('IX_CDS_Class_Status', 'Class_Daily_Summaries', 'INDEX IX_CDS_Class_Status ON dbo.Class_Daily_Summaries(ClassID, Status)'),

      createTable(
        'Summary_Personal_Notes',
        `
        NoteID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Summary_Personal_Notes PRIMARY KEY,
        SummaryID int NOT NULL CONSTRAINT FK_SPN_Summary REFERENCES dbo.Class_Daily_Summaries(SummaryID) ON DELETE CASCADE,
        StudentID int NOT NULL CONSTRAINT FK_SPN_Student REFERENCES dbo.Students(StudentID),
        Content nvarchar(2000) NOT NULL,
        CONSTRAINT UQ_SPN_Summary_Student UNIQUE (SummaryID, StudentID),
        INDEX IX_SPN_Student (StudentID)`,
      ),
      createTable(
        'Summary_Audio',
        `
        AudioID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Summary_Audio PRIMARY KEY,
        SummaryID int NOT NULL CONSTRAINT FK_SA_Summary REFERENCES dbo.Class_Daily_Summaries(SummaryID) ON DELETE CASCADE,
        AudioUrl nvarchar(500) NOT NULL,
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_Summary_Audio_CreatedAt DEFAULT SYSUTCDATETIME(),
        INDEX IX_SA_Summary (SummaryID)`,
      ),
      // A held issue keeps its statement out of the journal until the teacher says where it goes.
      // Lists of names and student ids are JSON arrays.
      createTable(
        'Summary_Review_Issues',
        `
        ReviewIssueID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Summary_Review_Issues PRIMARY KEY,
        SummaryID int NOT NULL CONSTRAINT FK_SRI_Summary REFERENCES dbo.Class_Daily_Summaries(SummaryID) ON DELETE CASCADE,
        IssueKey nvarchar(40) NOT NULL,
        IssueType nvarchar(40) NOT NULL CONSTRAINT CK_SRI_Type CHECK (${oneOf('IssueType', ISSUE_TYPES)}),
        Section nvarchar(20) NOT NULL CONSTRAINT CK_SRI_Section CHECK (${oneOf('Section', SECTION_KEYS)}),
        Text nvarchar(2000) NULL,
        Message nvarchar(500) NOT NULL,
        SpokenNames ${json('SpokenNames')},
        Candidates ${json('Candidates')},
        StudentIDs ${json('StudentIDs')},
        Held bit NOT NULL CONSTRAINT DF_SRI_Held DEFAULT 0,
        Status nvarchar(10) NOT NULL CONSTRAINT DF_SRI_Status DEFAULT N'open' CONSTRAINT CK_SRI_Status CHECK (${oneOf('Status', ['open', 'resolved'])}),
        Resolution nvarchar(20) NULL CONSTRAINT CK_SRI_Resolution CHECK (${oneOf('Resolution', ['assigned', 'class', 'discarded', 'confirmed'], true)}),
        AssignedTo ${json('AssignedTo')},
        ResolvedAt datetime2 NULL,
        SortOrder int NOT NULL CONSTRAINT DF_SRI_SortOrder DEFAULT 0,
        CONSTRAINT UQ_SRI_Summary_Key UNIQUE (SummaryID, IssueKey)`,
      ),
    ),
  )
}

export async function down() {
  await exec(
    batches(
      dropTable('Summary_Review_Issues'),
      dropTable('Summary_Audio'),
      dropTable('Summary_Personal_Notes'),
      dropIndex('IX_CDS_Class_Status', 'Class_Daily_Summaries'),
      ...['PublishedAt', 'ApprovedAt', 'RawTranscript', 'InputMethod', 'Status', 'GeneralNote'].map((c) => dropColumn('Class_Daily_Summaries', c)),
      // Text longer than the backup's 255 characters is cut so the columns fit again.
      ...SECTIONS.map((column) => `UPDATE dbo.Class_Daily_Summaries SET ${column} = LEFT(${column}, 255) WHERE LEN(${column}) > 255`),
      ...SECTIONS.map((column) => `ALTER TABLE dbo.Class_Daily_Summaries ALTER COLUMN ${column} nvarchar(255) NULL`),
    ),
  )
}
