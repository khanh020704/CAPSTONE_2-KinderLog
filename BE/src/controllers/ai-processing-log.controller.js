import { aiProcessingLogService } from '../services/index.js'
import { toCreateAiProcessingLogDto, toUpdateAiProcessingLogDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(aiProcessingLogService, { toCreateDto: toCreateAiProcessingLogDto, toUpdateDto: toUpdateAiProcessingLogDto })
