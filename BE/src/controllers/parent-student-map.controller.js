import { parentStudentMapService } from '../services/index.js'
import { toCreateParentStudentMapDto, toUpdateParentStudentMapDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(parentStudentMapService, { toCreateDto: toCreateParentStudentMapDto, toUpdateDto: toUpdateParentStudentMapDto })
