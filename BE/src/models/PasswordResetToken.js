import { Schema, model } from 'mongoose'
import { ref, schemaOptions } from './helpers.js'

// Only the SHA-256 hash of a reset token is stored, never the token itself.
const passwordResetTokenSchema = new Schema(
  {
    userId: ref('User', { required: true }),
    tokenHash: { type: String, required: true, maxlength: 128, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  schemaOptions({ collection: 'password_reset_tokens', timestamps: { createdAt: true, updatedAt: false } }),
)

// MongoDB deletes the document once expiresAt has passed.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default model('PasswordResetToken', passwordResetTokenSchema)
