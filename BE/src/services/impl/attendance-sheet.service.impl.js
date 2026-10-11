import mongoose from 'mongoose'
import { Attendance, Class, Student } from '../../models/index.js'
import { todayISO } from '../../models/helpers.js'
import { toSheetResponse } from '../../dtos/attendance-sheet.dto.js'
import { recordAudit } from '../../utils/audit.js'
import { BadRequestError, FieldError, ForbiddenError, NotFoundError } from '../../utils/errors.js'
import AttendanceSheetService from '../attendance-sheet.service.js'
import { requireTeacherClass } from './scope.js'

// A teacher always works on their own class; naming another class is refused rather than ignored.
async function classFor(user, classId) {
  if (user.role === 'TEACHER') {
    const cls = await requireTeacherClass(user.id)
    if (classId && String(cls._id) !== classId) throw new ForbiddenError('You can only work with your own class.')
    return cls
  }
  const cls = mongoose.isValidObjectId(classId) ? await Class.findById(classId) : null
  if (!cls) throw new NotFoundError('Class was not found.')
  return cls
}

// Counted against the active children of the class; the rows shown are theirs too.
async function loadSheet(cls, date) {
  const students = await Student.find({ classId: cls._id, isActive: true }).select('_id')
  const rows = await Attendance.find({ studentId: { $in: students.map((s) => s._id) }, attendanceDate: date })
  return toSheetResponse({ classId: cls._id, date, total: students.length, rows })
}

class AttendanceSheetServiceImpl extends AttendanceSheetService {
  async getSheet(user, { classId, date = todayISO() }) {
    return loadSheet(await classFor(user, classId), date)
  }

  async saveSheet(user, { classId, date, rows }) {
    const cls = await classFor(user, classId)
    if (date > todayISO()) throw new FieldError('date', 'Attendance cannot be recorded for a future date.')

    const students = await Student.find({ classId: cls._id }).select('_id')
    const inClass = new Set(students.map((s) => String(s._id)))
    const strangers = rows.filter((row) => !inClass.has(row.studentId))
    if (strangers.length) {
      const fields = Object.fromEntries(strangers.map((row) => [`records.${row.studentId}`, 'This student is not in the class.']))
      throw new BadRequestError('Some students are not in this class.', fields)
    }

    // The sheet replaces what was saved before: listed children are written, the others are cleared.
    if (rows.length) {
      await Attendance.bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: { studentId: row.studentId, attendanceDate: date },
            update: { $set: { classId: cls._id, status: row.status, note: row.note, recordedBy: user.id } },
            upsert: true,
          },
        })),
      )
    }
    await Attendance.deleteMany({
      studentId: { $in: students.map((s) => s._id), $nin: rows.map((row) => row.studentId) },
      attendanceDate: date,
    })

    await recordAudit({ userId: user.id, action: 'Update', module: 'Attendance', description: `Attendance saved: ${cls.className}` })
    return loadSheet(cls, date)
  }
}

export default new AttendanceSheetServiceImpl()
