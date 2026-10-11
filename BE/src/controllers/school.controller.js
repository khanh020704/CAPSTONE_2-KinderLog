import { schoolService } from '../services/index.js'
import { toCreateSchoolDto, toUpdateSchoolDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(schoolService, { toCreateDto: toCreateSchoolDto, toUpdateDto: toUpdateSchoolDto })
