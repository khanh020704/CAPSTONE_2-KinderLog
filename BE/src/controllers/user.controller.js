import { userService } from '../services/index.js'
import { toCreateUserDto, toUpdateUserDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(userService, {
  toCreateDto: toCreateUserDto,
  toUpdateDto: toUpdateUserDto,
  // Users cannot be searched by password.
  toFilterDto: ({ password, ...query }) => toUpdateUserDto(query),
})
