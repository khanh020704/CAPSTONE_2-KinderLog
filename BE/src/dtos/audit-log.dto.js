import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['userId', 'action', 'entityName', 'entityId', 'description', 'ipAddress', 'status']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt']

export const toCreateAuditLogDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateAuditLogDto = (body) => pick(body, INPUT_FIELDS)
export const toAuditLogResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
