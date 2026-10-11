import { Schema, model } from 'mongoose'
import { schemaOptions } from './helpers.js'

// Platform settings as key/value pairs, e.g. { key: 'maxPhotos', value: 6 }.
const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 50, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  schemaOptions({ collection: 'system_settings', timestamps: { createdAt: false, updatedAt: true } }),
)

export default model('SystemSetting', systemSettingSchema)
