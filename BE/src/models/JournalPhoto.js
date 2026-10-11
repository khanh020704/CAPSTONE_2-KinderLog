import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

const journalPhotoSchema = new Schema(
  {
    journalId: ref('DailyJournal'),
    summaryId: ref('ClassDailySummary'),
    classId: ref('Class', { required: true }),
    photoUrl: { type: String, required: true, maxlength: 500 },
    caption: { type: String, maxlength: 255 },
    isApproved: { type: Boolean, required: true, default: false },
    uploadedBy: ref('User'),
  },
  schemaOptions({ collection: 'journal_photos', timestamps: { createdAt: 'uploadedAt', updatedAt: false } }),
)

journalPhotoSchema.index({ journalId: 1 })
journalPhotoSchema.index({ summaryId: 1 })

// A photo belongs to a student's journal or to a class summary.
journalPhotoSchema.pre('validate', function () {
  if (this.journalId == null && this.summaryId == null) {
    this.invalidate('journalId', 'A photo needs a journalId or a summaryId.')
  }
})

belongsTo(journalPhotoSchema, 'journal', 'DailyJournal', 'journalId')
belongsTo(journalPhotoSchema, 'summary', 'ClassDailySummary', 'summaryId')
belongsTo(journalPhotoSchema, 'class', 'Class', 'classId')
belongsTo(journalPhotoSchema, 'uploader', 'User', 'uploadedBy')

export default model('JournalPhoto', journalPhotoSchema)
