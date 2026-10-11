import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['parentId', 'studentId', 'relationship', 'isPrimary', 'canPickup', 'isActive']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt']

export const toCreateParentStudentMapDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateParentStudentMapDto = (body) => pick(body, INPUT_FIELDS)
export const toParentStudentMapResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
