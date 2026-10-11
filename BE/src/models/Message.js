import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

export const SENDER_ROLES = ['PARENT', 'TEACHER']

// One conversation is one (parentId, teacherId) pair. Text only.
const messageSchema = new Schema(
  {
    parentId: ref('User', { required: true }),
    teacherId: ref('User', { required: true }),
    senderRole: { type: String, required: true, enum: SENDER_ROLES },
    content: { type: String, required: true, maxlength: 2000 },
    // Read by the receiving side.
    isRead: { type: Boolean, required: true, default: false },
    readAt: { type: Date },
  },
  schemaOptions({ collection: 'messages', timestamps: { createdAt: 'sentAt', updatedAt: false } }),
)

messageSchema.index({ parentId: 1, teacherId: 1, sentAt: 1 })
messageSchema.index({ teacherId: 1, isRead: 1 })
messageSchema.index({ parentId: 1, isRead: 1 })

belongsTo(messageSchema, 'parent', 'User', 'parentId')
belongsTo(messageSchema, 'teacher', 'User', 'teacherId')

export default model('Message', messageSchema)
