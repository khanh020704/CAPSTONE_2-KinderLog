import { attendanceService } from '../services/index.js'
import { toCreateAttendanceDto, toUpdateAttendanceDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(attendanceService, { toCreateDto: toCreateAttendanceDto, toUpdateDto: toUpdateAttendanceDto })
