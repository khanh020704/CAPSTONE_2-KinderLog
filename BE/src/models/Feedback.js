import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

const feedbackSchema = new Schema(
  {
    journalId: ref('DailyJournal', { required: true }),
    parentId: ref('User', { required: true }),
    content: { type: String, maxlength: 1000 },
    isRead: { type: Boolean, required: true, default: false },
  },
  schemaOptions({ collection: 'feedbacks', timestamps: { createdAt: true, updatedAt: false } }),
)

feedbackSchema.index({ journalId: 1 })
feedbackSchema.index({ parentId: 1 })

belongsTo(feedbackSchema, 'journal', 'DailyJournal', 'journalId')
belongsTo(feedbackSchema, 'parent', 'User', 'parentId')

export default model('Feedback', feedbackSchema)
