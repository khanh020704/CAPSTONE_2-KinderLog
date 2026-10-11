import { JournalPhoto } from '../../models/index.js'
import { toJournalPhotoResponse } from '../../dtos/journal-photo.dto.js'
import JournalPhotoService from '../journal-photo.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class JournalPhotoServiceImpl extends crudServiceImpl(JournalPhotoService) {
  constructor() {
    super(JournalPhoto, toJournalPhotoResponse)
  }
}

export default new JournalPhotoServiceImpl()
