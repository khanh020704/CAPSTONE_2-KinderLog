import { ParentStudentMap } from '../../models/index.js'
import { toParentStudentMapResponse } from '../../dtos/parent-student-map.dto.js'
import ParentStudentMapService from '../parent-student-map.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class ParentStudentMapServiceImpl extends crudServiceImpl(ParentStudentMapService) {
  constructor() {
    super(ParentStudentMap, toParentStudentMapResponse)
  }
}

export default new ParentStudentMapServiceImpl()
