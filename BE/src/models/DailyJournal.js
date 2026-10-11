import { Schema, model } from 'mongoose'
import { belongsTo, dateOnly, hasMany, ref, schemaOptions } from './helpers.js'

export const JOURNAL_STATUSES = ['DRAFT', 'APPROVED', 'REJECTED']
export const INPUT_METHODS = ['VOICE', 'MANUAL', 'BULK']

const detail = { type: String, maxlength: 500 }

const dailyJournalSchema = new Schema(
  {
    studentId: ref('Student', { required: true }),
    classId: ref('Class', { required: true }),
    journalDate: dateOnly({ required: true }),
    mealDetail: detail,
    sleepDetail: detail,
    studyDetail: detail,
    playDetail: detail,
    healthDetail: detail,
    emotionDetail: detail,
    symptoms: detail,
    status: { type: String, required: true, enum: JOURNAL_STATUSES, default: 'DRAFT' },
    isException: { type: Boolean, required: true, default: false },
    inputMethod: { type: String, enum: INPUT_METHODS },
    rawTranscript: { type: String },
    aiJsonResult: { type: String },
    createdBy: ref('User'),
    approvedBy: ref('User'),
    approvedAt: { type: Date },
  },
  schemaOptions({ collection: 'daily_journals', timestamps: true }),
)

dailyJournalSchema.index({ studentId: 1, journalDate: 1 }, { unique: true })
dailyJournalSchema.index({ journalDate: 1, classId: 1 })
dailyJournalSchema.index({ status: 1 })

belongsTo(dailyJournalSchema, 'student', 'Student', 'studentId')
belongsTo(dailyJournalSchema, 'class', 'Class', 'classId')
belongsTo(dailyJournalSchema, 'creator', 'User', 'createdBy')
belongsTo(dailyJournalSchema, 'approver', 'User', 'approvedBy')
hasMany(dailyJournalSchema, 'photos', 'JournalPhoto', 'journalId')
hasMany(dailyJournalSchema, 'feedbacks', 'Feedback', 'journalId')

export default model('DailyJournal', dailyJournalSchema)
