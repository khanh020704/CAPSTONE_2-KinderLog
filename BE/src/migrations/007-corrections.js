// A further recording may correct what an earlier one said ("Cô nhầm, bé An ăn hết suất"). When it is clear which
// earlier statement is corrected, the statement is replaced and the replacement is kept as a point to confirm of
// the new type `correction`: PreviousText holds the statement that was replaced, Text the one that replaced it, so
// the teacher can check it, or undo it (the new resolution `reverted`), and the history of the change is kept.
import { exec } from '../db/sql.js'
import { addColumn, batches, dropColumn, oneOf, setCheck } from './lib/tsql.js'

const TYPES_BEFORE = ['unknown_student', 'ambiguous_student', 'name_mismatch', 'missing_student', 'child_named_in_class_text', 'contradiction', 'unclear', 'health_alert', 'unsupported_content', 'attendance_mismatch']
const RESOLUTIONS_BEFORE = ['assigned', 'class', 'discarded', 'confirmed']

export async function up() {
  await exec(
    batches(
      addColumn('Summary_Review_Issues', 'PreviousText', 'nvarchar(2000) NULL'),
      setCheck('Summary_Review_Issues', 'CK_SRI_Type', oneOf('IssueType', [...TYPES_BEFORE, 'correction'])),
      setCheck('Summary_Review_Issues', 'CK_SRI_Resolution', oneOf('Resolution', [...RESOLUTIONS_BEFORE, 'reverted'], true)),
    ),
  )
}

// Points of the new type are removed, as the earlier rules do not allow them.
export async function down() {
  await exec(
    batches(
      `DELETE FROM dbo.Summary_Review_Issues WHERE IssueType = N'correction' OR Resolution = N'reverted'`,
      setCheck('Summary_Review_Issues', 'CK_SRI_Resolution', oneOf('Resolution', RESOLUTIONS_BEFORE, true)),
      setCheck('Summary_Review_Issues', 'CK_SRI_Type', oneOf('IssueType', TYPES_BEFORE)),
      dropColumn('Summary_Review_Issues', 'PreviousText'),
    ),
  )
}
