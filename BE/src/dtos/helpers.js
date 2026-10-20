// Request DTO: keep only the fields a client may set, and only those it actually sent.
export function pick(body, fields) {
  const dto = {}
  for (const field of fields) {
    if (body?.[field] !== undefined) dto[field] = body[field]
  }
  return dto
}

// Response DTO: `id` plus the listed fields, missing values as null.
export function toResponse(row, fields) {
  if (!row) return null
  const response = { id: String(row.id) }
  for (const field of fields) response[field] = row[field] ?? null
  return response
}
