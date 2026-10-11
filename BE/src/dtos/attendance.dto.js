import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = ['studentId', 'classId', 'attendanceDate', 'status', 'note', 'recordedBy']
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt', 'updatedAt']

export const toCreateAttendanceDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateAttendanceDto = (body) => pick(body, INPUT_FIELDS)
export const toAttendanceResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
