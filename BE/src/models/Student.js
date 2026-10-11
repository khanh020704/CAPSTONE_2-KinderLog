import { Schema, model } from 'mongoose'
import { belongsTo, dateOnly, hasMany, ref, schemaOptions, todayISO } from './helpers.js'

export const GENDERS = ['Male', 'Female', 'Other']

const studentSchema = new Schema(
  {
    studentCode: { type: String, required: true, maxlength: 20, unique: true },
    fullName: { type: String, required: true, maxlength: 100 },
    nickname: { type: String, maxlength: 50 },
    dateOfBirth: dateOnly({ required: true }),
    gender: { type: String, required: true, enum: GENDERS },
    classId: ref('Class'),
    allergyHistory: { type: String, maxlength: 500 },
    healthNote: { type: String, maxlength: 500 },
    photoUrl: { type: String, maxlength: 500 },
    enrollmentDate: dateOnly({ required: true, default: todayISO }),
    isActive: { type: Boolean, required: true, default: true },
  },
  schemaOptions({ collection: 'students', timestamps: true }),
)

studentSchema.index({ classId: 1 })

belongsTo(studentSchema, 'class', 'Class', 'classId')
hasMany(studentSchema, 'parentLinks', 'ParentStudentMap', 'studentId')
hasMany(studentSchema, 'attendance', 'Attendance', 'studentId')
hasMany(studentSchema, 'journals', 'DailyJournal', 'studentId')

export default model('Student', studentSchema)
