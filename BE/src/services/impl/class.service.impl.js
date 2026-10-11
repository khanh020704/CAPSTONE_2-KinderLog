import { Class } from '../../models/index.js'
import { toClassResponse } from '../../dtos/class.dto.js'
import ClassService from '../class.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class ClassServiceImpl extends crudServiceImpl(ClassService) {
  constructor() {
    super(Class, toClassResponse)
  }
}

export default new ClassServiceImpl()
