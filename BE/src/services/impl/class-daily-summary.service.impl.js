import { UnitOfWork } from '../../db/unit-of-work.js'
import { ClassDailySummary } from '../../models/index.js'
import { toClassDailySummaryResponse } from '../../dtos/class-daily-summary.dto.js'
import ClassDailySummaryService from '../class-daily-summary.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class ClassDailySummaryServiceImpl extends crudServiceImpl(ClassDailySummaryService) {
  constructor() {
    super(ClassDailySummary, toClassDailySummaryResponse)
  }

  // A journal goes with its notes, recordings, points, published version and photos, in one transaction.
  async remove(id) {
    if (!(await UnitOfWork.run((uow) => uow.journals.remove(id)))) throw this.notFound(id)
  }
}

export default new ClassDailySummaryServiceImpl()
