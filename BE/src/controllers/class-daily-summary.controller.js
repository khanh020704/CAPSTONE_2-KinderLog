import { classDailySummaryService } from '../services/index.js'
import { toCreateClassDailySummaryDto, toUpdateClassDailySummaryDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(classDailySummaryService, { toCreateDto: toCreateClassDailySummaryDto, toUpdateDto: toUpdateClassDailySummaryDto })
