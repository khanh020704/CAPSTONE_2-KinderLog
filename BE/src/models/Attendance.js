import { Schema, model } from 'mongoose'
import { belongsTo, dateOnly, ref, schemaOptions } from './helpers.js'

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Excused']

const attendanceSchema = new Schema(
  {
    studentId: ref('Student', { required: true }),
    classId: ref('Class', { required: true }),
    attendanceDate: dateOnly({ required: true }),
    status: { type: String, required: true, enum: ATTENDANCE_STATUSES },
    note: { type: String, maxlength: 255 },
    recordedBy: ref('User'),
  },
  schemaOptions({ collection: 'attendance', timestamps: true }),
)

attendanceSchema.index({ studentId: 1, attendanceDate: 1 }, { unique: true })
attendanceSchema.index({ attendanceDate: 1, classId: 1 })

belongsTo(attendanceSchema, 'student', 'Student', 'studentId')
belongsTo(attendanceSchema, 'class', 'Class', 'classId')
belongsTo(attendanceSchema, 'recorder', 'User', 'recordedBy')

export default model('Attendance', attendanceSchema)
