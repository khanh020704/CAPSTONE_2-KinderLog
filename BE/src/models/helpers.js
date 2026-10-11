import { Schema } from 'mongoose'

// Calendar dates are stored as 'YYYY-MM-DD' strings so they never shift with the time zone.
export const dateOnly = (options = {}) => ({ type: String, match: /^\d{4}-\d{2}-\d{2}$/, ...options })

export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const ref = (model, options = {}) => ({ type: Schema.Types.ObjectId, ref: model, ...options })

// Populated relations are virtuals, so they must be included when a document is serialised.
export const schemaOptions = (options = {}) => ({ toJSON: { virtuals: true }, toObject: { virtuals: true }, ...options })

// doc.populate('teacher') fills `teacher` from the id stored in `teacherId`.
export function belongsTo(schema, name, model, localField) {
  schema.virtual(name, { ref: model, localField, foreignField: '_id', justOne: true })
}

// doc.populate('students') fills `students` with the documents whose `classId` points here.
export function hasMany(schema, name, model, foreignField) {
  schema.virtual(name, { ref: model, localField: '_id', foreignField })
}
