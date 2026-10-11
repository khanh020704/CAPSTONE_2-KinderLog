import CrudService from './crud.service.js'

/** Contract of the User service. `create` and `update` take a plain `password` and store its hash. */
export default class UserService extends CrudService {
  /** @returns {Promise<object|null>} the user's response DTO, or null */
  async findByUsername(username) {
    throw new Error('findByUsername is not implemented')
  }

  /** @returns {Promise<object|null>} the user's response DTO when the password matches, otherwise null */
  async verifyCredentials(username, password) {
    throw new Error('verifyCredentials is not implemented')
  }
}
