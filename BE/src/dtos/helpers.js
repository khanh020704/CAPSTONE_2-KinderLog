import mongoose from 'mongoose'

// Request DTO: keep only the fields a client may set, and only those it actually sent.
export function pick(body, fields) {
  const dto = {}
  for (const field of fields) {
    if (body?.[field] !== undefined) dto[field] = body[field]
  }
  return dto
}

// Response DTO: `id` plus the listed fields, with references as plain strings and missing values as null.
export function toResponse(doc, fields) {
  if (!doc) return null
  const response = { id: String(doc._id) }
  for (const field of fields) {
    const value = doc[field]
    response[field] = value instanceof mongoose.Types.ObjectId ? String(value) : (value ?? null)
  }
  return response
}
