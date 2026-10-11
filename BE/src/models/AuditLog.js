import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

export const AUDIT_STATUSES = ['Success', 'Failed']

const auditLogSchema = new Schema(
  {
    userId: ref('User'),
    action: { type: String, required: true, maxlength: 100 },
    entityName: { type: String, maxlength: 50 },
    entityId: { type: String, maxlength: 50 },
    description: { type: String, maxlength: 1000 },
    ipAddress: { type: String, maxlength: 45 },
    status: { type: String, required: true, enum: AUDIT_STATUSES, default: 'Success' },
  },
  schemaOptions({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } }),
)

auditLogSchema.index({ createdAt: 1 })

belongsTo(auditLogSchema, 'user', 'User', 'userId')

export default model('AuditLog', auditLogSchema)
