import { Schema, model } from 'mongoose'
import { belongsTo, hasMany, ref, schemaOptions } from './helpers.js'

const classSchema = new Schema(
  {
    classCode: { type: String, required: true, maxlength: 20 },
    className: { type: String, required: true, maxlength: 100 },
    gradeLevel: { type: String, required: true, maxlength: 50 },
    schoolYear: { type: String, required: true, maxlength: 20 },
    teacherId: ref('User'),
    roomName: { type: String, maxlength: 50 },
    maxCapacity: { type: Number, required: true, default: 30 },
    isActive: { type: Boolean, required: true, default: true },
  },
  schemaOptions({ collection: 'classes', timestamps: true }),
)

classSchema.index({ classCode: 1, schoolYear: 1 }, { unique: true })
classSchema.index({ teacherId: 1 })

belongsTo(classSchema, 'teacher', 'User', 'teacherId')
hasMany(classSchema, 'students', 'Student', 'classId')
hasMany(classSchema, 'attendance', 'Attendance', 'classId')
hasMany(classSchema, 'summaries', 'ClassDailySummary', 'classId')
hasMany(classSchema, 'journals', 'DailyJournal', 'classId')

export default model('Class', classSchema)
