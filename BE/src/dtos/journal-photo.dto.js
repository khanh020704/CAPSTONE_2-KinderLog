import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['journalId', 'summaryId', 'classId', 'photoUrl', 'caption', 'isApproved', 'uploadedBy']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'uploadedAt']

export const toCreateJournalPhotoDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateJournalPhotoDto = (body) => pick(body, INPUT_FIELDS)
export const toJournalPhotoResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
