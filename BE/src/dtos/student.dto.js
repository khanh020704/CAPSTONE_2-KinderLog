import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = [
  'studentCode',
  'fullName',
  'nickname',
  'dateOfBirth',
  'gender',
  'classId',
  'allergyHistory',
  'healthNote',
  'photoUrl',
  'enrollmentDate',
  'isActive',
]
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt', 'updatedAt']

export const toCreateStudentDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateStudentDto = (body) => pick(body, INPUT_FIELDS)
export const toStudentResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
