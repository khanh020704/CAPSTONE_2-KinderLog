import { BadRequestError, FieldError } from '../utils/errors.js'
import { isDateOnly, isPlainObject, toMillis } from '../utils/text.js'

// API value -> stored value. The frontend only sends present and absent today.
const STATUS_TO_STORED = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' }
export const toApiAttendanceStatus = (stored) => stored.toLowerCase()

const HERE = new Set(['Present', 'Late'])
const AWAY = new Set(['Absent', 'Excused'])

// A child marked late is in class and one who is excused is not, so both are counted accordingly.
export function toAttendanceCounts(total, rows) {
  const present = rows.filter((r) => HERE.has(r.status)).length
  const absent = rows.filter((r) => AWAY.has(r.status)).length
  return { total, present, absent, unrecorded: Math.max(0, total - present - absent), recorded: rows.length > 0 }
}

export function toSheetQueryDto(query) {
  const { classId, date } = query ?? {}
  if (date !== undefined && !isDateOnly(date)) throw new FieldError('date', 'Use the date format YYYY-MM-DD.')
  return { classId: typeof classId === 'string' ? classId : undefined, date }
}

export function toSaveSheetDto(body) {
  const { classId, date, records } = body ?? {}
  if (!isDateOnly(date)) throw new FieldError('date', 'Use the date format YYYY-MM-DD.')
  if (!isPlainObject(records)) throw new FieldError('records', 'Records must be an object keyed by student id.')
  const fields = {}
  const rows = Object.entries(records).map(([studentId, record]) => {
    const status = STATUS_TO_STORED[record?.status]
    const note = record?.note ?? ''
    if (!status) fields[`records.${studentId}.status`] = 'Use present or absent.'
    if (typeof note !== 'string' || note.length > 255) fields[`records.${studentId}.note`] = 'Keep the note under 255 characters.'
    return { studentId, status, note: typeof note === 'string' ? note.trim() : '' }
  })
  if (Object.keys(fields).length) throw new BadRequestError('Some attendance records are invalid.', fields)
  return { classId: typeof classId === 'string' ? classId : undefined, date, rows }
}

export const toSheetResponse = ({ classId, date, total, rows }) => ({
  classId: String(classId),
  date,
  savedAt: rows.length ? Math.max(...rows.map((r) => toMillis(r.updatedAt || r.createdAt))) : null,
  records: Object.fromEntries(
    rows.map((r) => [String(r.studentId), { status: toApiAttendanceStatus(r.status), note: r.note || '' }]),
  ),
  counts: toAttendanceCounts(total, rows),
})
