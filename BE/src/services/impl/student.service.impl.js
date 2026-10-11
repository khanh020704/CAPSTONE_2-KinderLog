import { Student } from '../../models/index.js'
import { toStudentResponse } from '../../dtos/student.dto.js'
import StudentService from '../student.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class StudentServiceImpl extends crudServiceImpl(StudentService) {
  constructor() {
    super(Student, toStudentResponse)
  }
}

export default new StudentServiceImpl()
