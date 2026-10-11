import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['journalId', 'parentId', 'content', 'isRead']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt']

export const toCreateFeedbackDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateFeedbackDto = (body) => pick(body, INPUT_FIELDS)
export const toFeedbackResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
