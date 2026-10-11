import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

export const NOTIFICATION_TYPES = ['JOURNAL_NEW', 'HEALTH_ALERT', 'SYSTEM', 'FEEDBACK', 'MESSAGE', 'ANNOUNCEMENT']

const notificationSchema = new Schema(
  {
    userId: ref('User', { required: true }),
    studentId: ref('Student'),
    journalId: ref('DailyJournal'),
    // The class journal a JOURNAL_NEW notification points to.
    summaryId: ref('ClassDailySummary'),
    title: { type: String, required: true, maxlength: 200 },
    content: { type: String, maxlength: 1000 },
    type: { type: String, required: true, enum: NOTIFICATION_TYPES },
    isRead: { type: Boolean, required: true, default: false },
    readAt: { type: Date },
  },
  schemaOptions({ collection: 'notifications', timestamps: { createdAt: 'sentAt', updatedAt: false } }),
)

notificationSchema.index({ userId: 1, isRead: 1 })

belongsTo(notificationSchema, 'user', 'User', 'userId')
belongsTo(notificationSchema, 'student', 'Student', 'studentId')
belongsTo(notificationSchema, 'journal', 'DailyJournal', 'journalId')

export default model('Notification', notificationSchema)
