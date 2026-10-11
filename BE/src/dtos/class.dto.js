import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['classCode', 'className', 'gradeLevel', 'schoolYear', 'teacherId', 'roomName', 'maxCapacity', 'isActive']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt', 'updatedAt']

export const toCreateClassDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateClassDto = (body) => pick(body, INPUT_FIELDS)
export const toClassResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
