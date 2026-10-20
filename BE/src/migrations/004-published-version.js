// A published journal can be edited again. What parents see is kept apart from the teacher's working copy:
//   - Summary_Published: the class sections as last published
//   - Summary_Published_Notes, Summary_Published_Photos: the personal notes and photos as last published
//   - Class_Daily_Summaries.Revision: how many times the journal has been published
// Journals published before this migration get their current content as version 1.
import { exec } from '../db/sql.js'
import { addColumn, batches, createTable, dropColumn, dropTable } from './lib/tsql.js'

const COLUMNS = ['GeneralMeal', 'GeneralSleep', 'GeneralStudy', 'GeneralHealth', 'GeneralMood', 'GeneralNote']

export async function up() {
  await exec(
    batches(
      addColumn('Class_Daily_Summaries', 'Revision', 'int NOT NULL CONSTRAINT DF_CDS_Revision DEFAULT 0'),
      createTable(
        'Summary_Published',
        `
        SummaryID int NOT NULL CONSTRAINT PK_Summary_Published PRIMARY KEY
          CONSTRAINT FK_SP_Summary REFERENCES dbo.Class_Daily_Summaries(SummaryID) ON DELETE CASCADE,
        ${COLUMNS.map((c) => `${c} nvarchar(2000) NULL`).join(',\n        ')},
        PublishedAt datetime2 NOT NULL`,
      ),
      createTable(
        'Summary_Published_Notes',
        `
        SummaryID int NOT NULL CONSTRAINT FK_SPNote_Published REFERENCES dbo.Summary_Published(SummaryID) ON DELETE CASCADE,
        StudentID int NOT NULL CONSTRAINT FK_SPNote_Student REFERENCES dbo.Students(StudentID),
        Content nvarchar(2000) NOT NULL,
        CONSTRAINT PK_Summary_Published_Notes PRIMARY KEY (SummaryID, StudentID),
        INDEX IX_SPNote_Student (StudentID)`,
      ),
      createTable(
        'Summary_Published_Photos',
        `
        PublishedPhotoID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Summary_Published_Photos PRIMARY KEY,
        SummaryID int NOT NULL CONSTRAINT FK_SPPhoto_Published REFERENCES dbo.Summary_Published(SummaryID) ON DELETE CASCADE,
        PhotoUrl nvarchar(500) NOT NULL,
        SortOrder int NOT NULL,
        INDEX IX_SPPhoto_Summary (SummaryID, SortOrder)`,
      ),
    ),
  )
  // Version 1 of every journal published before.
  await exec(`
    DECLARE @old TABLE (SummaryID int PRIMARY KEY)
    INSERT @old SELECT s.SummaryID FROM dbo.Class_Daily_Summaries s
      WHERE s.Status = N'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM dbo.Summary_Published p WHERE p.SummaryID = s.SummaryID)

    INSERT dbo.Summary_Published (SummaryID, ${COLUMNS.join(', ')}, PublishedAt)
      SELECT s.SummaryID, ${COLUMNS.map((c) => `s.${c}`).join(', ')}, COALESCE(s.PublishedAt, s.UpdatedAt, s.CreatedAt)
      FROM dbo.Class_Daily_Summaries s JOIN @old o ON o.SummaryID = s.SummaryID
    INSERT dbo.Summary_Published_Notes (SummaryID, StudentID, Content)
      SELECT n.SummaryID, n.StudentID, n.Content FROM dbo.Summary_Personal_Notes n JOIN @old o ON o.SummaryID = n.SummaryID
    INSERT dbo.Summary_Published_Photos (SummaryID, PhotoUrl, SortOrder)
      SELECT p.SummaryID, p.PhotoUrl, ROW_NUMBER() OVER (PARTITION BY p.SummaryID ORDER BY p.PhotoID)
      FROM dbo.Journal_Photos p JOIN @old o ON o.SummaryID = p.SummaryID
    UPDATE s SET Revision = 1 FROM dbo.Class_Daily_Summaries s JOIN @old o ON o.SummaryID = s.SummaryID`)
}

// A journal edited after publishing and not yet published again loses the version parents were seeing.
export async function down() {
  await exec(batches(dropTable('Summary_Published_Photos'), dropTable('Summary_Published_Notes'), dropTable('Summary_Published'), dropColumn('Class_Daily_Summaries', 'Revision')))
}
