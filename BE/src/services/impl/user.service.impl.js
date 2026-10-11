import { User } from '../../models/index.js'
import { toUserResponse } from '../../dtos/user.dto.js'
import { BadRequestError } from '../../utils/errors.js'
import { hashPassword, verifyPassword } from '../../utils/password.js'
import UserService from '../user.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

const MIN_PASSWORD_LENGTH = 6

// Turns a request DTO into what is stored: `password` becomes `passwordHash`,
// and an empty email or phone number is removed so it does not take a slot in the unique index.
async function toStored({ password, ...dto }, { passwordRequired }) {
  if ('email' in dto && !dto.email) dto.email = undefined
  if ('phoneNumber' in dto && !dto.phoneNumber) dto.phoneNumber = undefined
  if (password === undefined && !passwordRequired) return dto
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    const message = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    throw new BadRequestError(message, { password: message })
  }
  return { ...dto, passwordHash: await hashPassword(password) }
}

class UserServiceImpl extends crudServiceImpl(UserService) {
  constructor() {
    super(User, toUserResponse)
  }

  async create(dto) {
    return super.create(await toStored(dto, { passwordRequired: true }))
  }

  async update(id, dto) {
    return super.update(id, await toStored(dto, { passwordRequired: false }))
  }

  async findByUsername(username) {
    return toUserResponse(await User.findOne({ username: String(username) }))
  }

  async verifyCredentials(username, password) {
    const user = await User.findOne({ username: String(username) }).select('+passwordHash')
    if (!user || !(await verifyPassword(String(password), user.passwordHash))) return null
    return toUserResponse(user)
  }
}

export default new UserServiceImpl()
