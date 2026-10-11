import { studentService } from '../services/index.js'
import { toCreateStudentDto, toUpdateStudentDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(studentService, { toCreateDto: toCreateStudentDto, toUpdateDto: toUpdateStudentDto })
