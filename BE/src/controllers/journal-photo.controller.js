import { journalPhotoService } from '../services/index.js'
import { toCreateJournalPhotoDto, toUpdateJournalPhotoDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(journalPhotoService, { toCreateDto: toCreateJournalPhotoDto, toUpdateDto: toUpdateJournalPhotoDto })
