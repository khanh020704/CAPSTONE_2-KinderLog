import { ClassDailySummary } from '../../models/index.js'
import { toClassDailySummaryResponse } from '../../dtos/class-daily-summary.dto.js'
import ClassDailySummaryService from '../class-daily-summary.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class ClassDailySummaryServiceImpl extends crudServiceImpl(ClassDailySummaryService) {
  constructor() {
    super(ClassDailySummary, toClassDailySummaryResponse)
  }
}

export default new ClassDailySummaryServiceImpl()
