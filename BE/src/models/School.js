import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

const schoolSchema = new Schema(
  {
    schoolCode: { type: String, required: true, maxlength: 20, unique: true },
    schoolName: { type: String, required: true, maxlength: 200 },
    address: { type: String, maxlength: 300 },
    phone: { type: String, maxlength: 15 },
    email: { type: String, maxlength: 150 },
    principalId: ref('User'),
    isActive: { type: Boolean, required: true, default: true },
  },
  schemaOptions({ collection: 'schools', timestamps: { createdAt: true, updatedAt: false } }),
)

belongsTo(schoolSchema, 'principal', 'User', 'principalId')

export default model('School', schoolSchema)
