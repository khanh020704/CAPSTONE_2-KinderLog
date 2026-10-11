const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the authentication service. */
export default class AuthService {
  /**
   * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number, user: object }>}
   *   rejects with UnauthenticatedError for wrong credentials, ForbiddenError for an inactive or locked account
   */
  async login(dto) {
    throw notImplemented('login')
  }

  /**
   * Exchanges a refresh token for a new pair; the old refresh token stops working.
   * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
   */
  async refresh(dto) {
    throw notImplemented('refresh')
  }

  /**
   * Ends the session of the given refresh token, or every session of the user when none is given.
   * @returns {Promise<void>}
   */
  async logout(user, dto) {
    throw notImplemented('logout')
  }

  /**
   * Sends reset instructions to the account with this email.
   * @returns {Promise<{ sent: true }>} rejects with NotFoundError (EMAIL_NOT_FOUND)
   */
  async forgotPassword(dto) {
    throw notImplemented('forgotPassword')
  }

  /**
   * @returns {Promise<void>} rejects with BadRequestError (RESET_TOKEN_INVALID) for a wrong, used or expired token
   */
  async resetPassword(dto) {
    throw notImplemented('resetPassword')
  }

  /**
   * @param {string} token access token from the Authorization header
   * @returns {Promise<object>} the user; rejects with UnauthenticatedError
   */
  async authenticate(token) {
    throw notImplemented('authenticate')
  }
}
