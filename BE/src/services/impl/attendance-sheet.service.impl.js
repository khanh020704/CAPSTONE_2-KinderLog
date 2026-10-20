import { UnitOfWork } from '../../db/unit-of-work.js'
import { todayISO } from '../../models/helpers.js'
import { toSheetResponse } from '../../dtos/attendance-sheet.dto.js'
import { recordAudit } from '../../utils/audit.js'
import { BadRequestError, FieldError, ForbiddenError, NotFoundError } from '../../utils/errors.js'
import AttendanceSheetService from '../attendance-sheet.service.js'
import { requireTeacherClass } from './scope.js'

// A teacher always works on their own class; naming another class is refused rather than ignored.
async function classFor(uow, user, classId) {
  if (user.role === 'TEACHER') {
    const cls = await requireTeacherClass(uow, user.id)
    if (classId && cls.id !== classId) throw new ForbiddenError('You can only work with your own class.')
    return cls
  }
  const cls = await uow.classes.findById(classId)
  if (!cls) throw new NotFoundError('Class was not found.')
  return cls
}

// Counted against the active children of the class; the rows shown are theirs too.
async function loadSheet(uow, cls, date) {
  const students = await uow.students.find({ classId: cls.id, isActive: true })
  const rows = students.length ? await uow.attendance.find({ studentId: students.map((s) => s.id), attendanceDate: date }) : []
  return toSheetResponse({ classId: cls.id, date, total: students.length, rows })
}

class AttendanceSheetServiceImpl extends AttendanceSheetService {
  async getSheet(user, { classId, date = todayISO() }) {
    const uow = UnitOfWork.read()
    return loadSheet(uow, await classFor(uow, user, classId), date)
  }

  async saveSheet(user, { classId, date, rows }) {
    // The whole sheet is one unit of work: every row is written, or none is.
    const { cls, sheet } = await UnitOfWork.run(async (uow) => {
      const cls = await classFor(uow, user, classId)
      if (date > todayISO()) throw new FieldError('date', 'Attendance cannot be recorded for a future date.')

      const students = await uow.students.find({ classId: cls.id })
      const inClass = new Set(students.map((s) => s.id))
      const strangers = rows.filter((row) => !inClass.has(row.studentId))
      if (strangers.length) {
        const fields = Object.fromEntries(strangers.map((row) => [`records.${row.studentId}`, 'This student is not in the class.']))
        throw new BadRequestError('Some students are not in this class.', fields)
      }

      // The sheet replaces what was saved before: listed children are written, the others are cleared.
      for (const row of rows) {
        const values = { classId: cls.id, status: row.status, note: row.note, recordedBy: user.id }
        const [changed] = await uow.attendance.update({ studentId: row.studentId, attendanceDate: date }, values)
        if (!changed) await uow.attendance.insert({ ...values, studentId: row.studentId, attendanceDate: date })
      }
      if (students.length) {
        await uow.attendance.remove({ studentId: { $in: students.map((s) => s.id), $nin: rows.map((row) => row.studentId) }, attendanceDate: date })
      }
      return { cls, sheet: await loadSheet(uow, cls, date) }
    })

    await recordAudit({ userId: user.id, action: 'Update', module: 'Attendance', description: `Attendance saved: ${cls.className}` })
    return sheet
  }
}

export default new AttendanceSheetServiceImpl()
