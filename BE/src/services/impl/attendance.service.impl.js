import { Attendance } from '../../models/index.js'
import { toAttendanceResponse } from '../../dtos/attendance.dto.js'
import AttendanceService from '../attendance.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class AttendanceServiceImpl extends crudServiceImpl(AttendanceService) {
  constructor() {
    super(Attendance, toAttendanceResponse)
  }
}

export default new AttendanceServiceImpl()
