import { isId } from '../db/table.js'
import { BadRequestError } from '../utils/errors.js'
import { isDateOnly, toMillis } from '../utils/text.js'
import { toApiAttendanceStatus } from './attendance-sheet.dto.js'
import { editedAtOf, toPublishedContent } from './journal.dto.js'

// ---------- responses ----------
// A parent sees the published version only, and of the personal notes only their own child's.
// The transcript, the recordings, the points to confirm and the other children's notes never leave the server.

export const toParentJournalListItem = (summary) => ({
  id: String(summary.id),
  date: summary.summaryDate,
  publishedAt: toMillis(summary.publishedAt),
  editedAt: editedAtOf(summary),
})

export function toParentJournalResponse(summary, studentId, attendance) {
  const { sections, personal, photos } = toPublishedContent(summary.publishedVersion)
  return {
    ...toParentJournalListItem(summary),
    classId: String(summary.classId),
    sections,
    personalNote: personal[studentId] || '',
    photos,
    attendance: attendance ? { status: toApiAttendanceStatus(attendance.status), note: attendance.note || '' } : null,
  }
}

// ---------- requests ----------

function readStudentId(query, fields) {
  const studentId = query?.studentId
  if (typeof studentId !== 'string' || !isId(studentId)) fields.studentId = 'Send the id of your child.'
  return studentId
}

const check = (fields) => {
  if (Object.keys(fields).length) throw new BadRequestError('Some fields are invalid.', fields)
}

// GET /parent/journals?studentId=&month=YYYY-MM
export function toParentJournalListQueryDto(query) {
  const fields = {}
  const studentId = readStudentId(query, fields)
  const month = query?.month
  if (month !== undefined && !(typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month))) fields.month = 'Use the month format YYYY-MM.'
  check(fields)
  return { studentId, month }
}

// GET /parent/journals/by-date?studentId=&date=YYYY-MM-DD
export function toParentJournalByDateQueryDto(query) {
  const fields = {}
  const studentId = readStudentId(query, fields)
  if (!isDateOnly(query?.date)) fields.date = 'Use the date format YYYY-MM-DD.'
  check(fields)
  return { studentId, date: query.date }
}
