import { classService } from '../services/index.js'
import { toCreateClassDto, toUpdateClassDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(classService, { toCreateDto: toCreateClassDto, toUpdateDto: toUpdateClassDto })
