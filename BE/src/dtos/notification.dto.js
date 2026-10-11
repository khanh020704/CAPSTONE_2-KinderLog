import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['userId', 'studentId', 'journalId', 'summaryId', 'title', 'content', 'type', 'isRead']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'readAt', 'sentAt']

export const toCreateNotificationDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateNotificationDto = (body) => pick(body, INPUT_FIELDS)
export const toNotificationResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
