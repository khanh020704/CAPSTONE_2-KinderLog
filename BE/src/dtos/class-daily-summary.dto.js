import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = [
  'classId',
  'summaryDate',
  'generalMeal',
  'generalSleep',
  'generalStudy',
  'generalPlay',
  'generalHealth',
  'generalMood',
  'totalStudents',
  'presentCount',
  'absentCount',
  'createdBy',
]
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt', 'updatedAt']

export const toCreateClassDailySummaryDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateClassDailySummaryDto = (body) => pick(body, INPUT_FIELDS)
export const toClassDailySummaryResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
