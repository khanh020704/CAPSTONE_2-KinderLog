import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['schoolCode', 'schoolName', 'address', 'phone', 'email', 'principalId', 'isActive']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt']

export const toCreateSchoolDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateSchoolDto = (body) => pick(body, INPUT_FIELDS)
export const toSchoolResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
