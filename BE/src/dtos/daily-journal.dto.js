import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = [
  'studentId',
  'classId',
  'journalDate',
  'mealDetail',
  'sleepDetail',
  'studyDetail',
  'playDetail',
  'healthDetail',
  'emotionDetail',
  'symptoms',
  'status',
  'isException',
  'inputMethod',
  'rawTranscript',
  'aiJsonResult',
  'createdBy',
]
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'approvedBy', 'approvedAt', 'createdAt', 'updatedAt']

export const toCreateDailyJournalDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateDailyJournalDto = (body) => pick(body, INPUT_FIELDS)
export const toDailyJournalResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
