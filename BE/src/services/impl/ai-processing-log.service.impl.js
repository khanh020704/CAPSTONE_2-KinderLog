import { AiProcessingLog } from '../../models/index.js'
import { toAiProcessingLogResponse } from '../../dtos/ai-processing-log.dto.js'
import AiProcessingLogService from '../ai-processing-log.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class AiProcessingLogServiceImpl extends crudServiceImpl(AiProcessingLogService) {
  constructor() {
    super(AiProcessingLog, toAiProcessingLogResponse)
  }
}

export default new AiProcessingLogServiceImpl()
