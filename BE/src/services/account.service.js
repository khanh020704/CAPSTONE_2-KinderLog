const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the "my account" service: the signed-in user reading and changing their own data. */
export default class AccountService {
  /**
   * @returns {Promise<object>} the account, with the teacher's class or the parent's children
   */
  async getProfile(user) {
    throw notImplemented('getProfile')
  }

  /**
   * @returns {Promise<object>} rejects with ConflictError (PHONE_TAKEN, EMAIL_TAKEN)
   */
  async updateProfile(user, dto) {
    throw notImplemented('updateProfile')
  }

  /**
   * @returns {Promise<void>} rejects with FieldError when the current password is wrong or the new one is not allowed
   */
  async changePassword(user, dto) {
    throw notImplemented('changePassword')
  }

  /**
   * @returns {Promise<object>} the user document; rejects with UnauthenticatedError when the account is gone, inactive or locked
   */
  async requireUsable(userId) {
    throw notImplemented('requireUsable')
  }
}
