import { School } from '../../models/index.js'
import { toSchoolResponse } from '../../dtos/school.dto.js'
import SchoolService from '../school.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class SchoolServiceImpl extends crudServiceImpl(SchoolService) {
  constructor() {
    super(School, toSchoolResponse)
  }
}

export default new SchoolServiceImpl()
