// A voice draft is checked against the day's attendance: what is said about a child who is marked absent
// (or present) and does not fit becomes a point to confirm of the new type attendance_mismatch.
import { exec } from '../db/sql.js'
import { batches, oneOf, setCheck } from './lib/tsql.js'

const BEFORE = ['unknown_student', 'ambiguous_student', 'name_mismatch', 'missing_student', 'child_named_in_class_text', 'contradiction', 'unclear', 'health_alert', 'unsupported_content']

export async function up() {
  await exec(setCheck('Summary_Review_Issues', 'CK_SRI_Type', oneOf('IssueType', [...BEFORE, 'attendance_mismatch'])))
}

// Points of the new type are removed, as the earlier rules do not allow them.
export async function down() {
  await exec(batches(`DELETE FROM dbo.Summary_Review_Issues WHERE IssueType = N'attendance_mismatch'`, setCheck('Summary_Review_Issues', 'CK_SRI_Type', oneOf('IssueType', BEFORE))))
}
