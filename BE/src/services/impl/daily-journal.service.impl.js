import { DailyJournal } from '../../models/index.js'
import { toDailyJournalResponse } from '../../dtos/daily-journal.dto.js'
import DailyJournalService from '../daily-journal.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class DailyJournalServiceImpl extends crudServiceImpl(DailyJournalService) {
  constructor() {
    super(DailyJournal, toDailyJournalResponse)
  }
}

export default new DailyJournalServiceImpl()
