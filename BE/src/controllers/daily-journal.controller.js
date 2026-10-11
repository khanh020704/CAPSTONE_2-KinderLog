import { dailyJournalService } from '../services/index.js'
import { toCreateDailyJournalDto, toUpdateDailyJournalDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(dailyJournalService, { toCreateDto: toCreateDailyJournalDto, toUpdateDto: toUpdateDailyJournalDto })
