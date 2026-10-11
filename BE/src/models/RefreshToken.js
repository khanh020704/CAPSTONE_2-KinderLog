import { Schema, model } from 'mongoose'
import { ref, schemaOptions } from './helpers.js'

// Only the SHA-256 hash of a refresh token is stored, never the token itself.
const refreshTokenSchema = new Schema(
  {
    userId: ref('User', { required: true }),
    tokenHash: { type: String, required: true, maxlength: 128, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  schemaOptions({ collection: 'refresh_tokens', timestamps: { createdAt: true, updatedAt: false } }),
)

refreshTokenSchema.index({ userId: 1 })
// MongoDB deletes the document once expiresAt has passed.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default model('RefreshToken', refreshTokenSchema)
