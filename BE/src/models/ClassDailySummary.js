import { Schema, model } from 'mongoose'
import { belongsTo, dateOnly, hasMany, ref, schemaOptions } from './helpers.js'

// The class journal of Md/API2.md: one per class per day, shared with every parent of the class.
// DRAFT (written by hand) or REVIEW (AI draft) -> APPROVED -> PUBLISHED (visible to parents).
export const SUMMARY_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED']
export const SUMMARY_INPUT_METHODS = ['MANUAL', 'VOICE']

const general = { type: String, maxlength: 2000 }

// A note about one child, shown only to that child's parents.
const personalNoteSchema = new Schema(
  {
    studentId: ref('Student', { required: true }),
    content: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false },
)

const classDailySummarySchema = new Schema(
  {
    classId: ref('Class', { required: true }),
    summaryDate: dateOnly({ required: true }),
    generalMeal: general,
    generalSleep: general,
    generalStudy: general,
    generalPlay: general,
    generalHealth: general,
    generalMood: general,
    generalNote: general,
    personalNotes: { type: [personalNoteSchema], default: [] },
    status: { type: String, required: true, enum: SUMMARY_STATUSES, default: 'DRAFT' },
    inputMethod: { type: String, enum: SUMMARY_INPUT_METHODS },
    rawTranscript: { type: String },
    audioUrls: { type: [String], default: [] },
    totalStudents: { type: Number },
    presentCount: { type: Number },
    absentCount: { type: Number },
    createdBy: ref('User'),
    approvedAt: { type: Date },
    publishedAt: { type: Date },
  },
  schemaOptions({ collection: 'class_daily_summaries', timestamps: true }),
)

classDailySummarySchema.index({ classId: 1, summaryDate: 1 }, { unique: true })
classDailySummarySchema.index({ classId: 1, status: 1 })

belongsTo(classDailySummarySchema, 'class', 'Class', 'classId')
belongsTo(classDailySummarySchema, 'creator', 'User', 'createdBy')
hasMany(classDailySummarySchema, 'photos', 'JournalPhoto', 'summaryId')

export default model('ClassDailySummary', classDailySummarySchema)
