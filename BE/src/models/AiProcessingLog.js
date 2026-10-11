import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

const aiProcessingLogSchema = new Schema(
  {
    userId: ref('User'),
    audioUrl: { type: String, maxlength: 500 },
    rawTranscript: { type: String },
    extractedJson: { type: String },
    asrProvider: { type: String, maxlength: 50 },
    llmModel: { type: String, maxlength: 50 },
    processingMs: { type: Number },
    isSuccess: { type: Boolean, required: true, default: true },
    errorMessage: { type: String, maxlength: 1000 },
  },
  schemaOptions({ collection: 'ai_processing_logs', timestamps: { createdAt: true, updatedAt: false } }),
)

belongsTo(aiProcessingLogSchema, 'user', 'User', 'userId')

export default model('AiProcessingLog', aiProcessingLogSchema)
