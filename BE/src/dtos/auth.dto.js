import { BadRequestError, FieldError } from '../utils/errors.js'
import { isEmail } from '../utils/text.js'

const ROLES = ['admin', 'teacher', 'parent']

// Sign in with a phone number (what the frontend sends) or with a username.
// Every value must be a plain string, so a crafted body cannot change what is looked up.
export function toLoginDto(body) {
  const { phone, username, password, role, remember } = body ?? {}
  const fields = {}
  const hasPhone = typeof phone === 'string' && phone.trim()
  const hasUsername = typeof username === 'string' && username.trim()
  if (!hasPhone && !hasUsername) fields.phone = 'Phone number is required.'
  if (typeof password !== 'string' || !password) fields.password = 'Password is required.'
  if (role !== undefined && !ROLES.includes(role)) fields.role = 'Choose a valid role.'
  if (Object.keys(fields).length) throw new BadRequestError('Some fields are invalid.', fields)
  return {
    ...(hasPhone ? { phone: phone.trim() } : { username: username.trim() }),
    password,
    role: role?.toUpperCase(),
    remember: remember === true,
  }
}

export function toRefreshDto(body) {
  const { refreshToken } = body ?? {}
  if (typeof refreshToken !== 'string' || !refreshToken) throw new FieldError('refreshToken', 'Refresh token is required.')
  return { refreshToken }
}

// The refresh token is optional on logout: without it every session of the user is ended.
export const toLogoutDto = (body) => ({ refreshToken: typeof body?.refreshToken === 'string' ? body.refreshToken : undefined })

export function toForgotPasswordDto(body) {
  const { email } = body ?? {}
  if (!isEmail(email)) throw new FieldError('email', 'Enter a valid email address.')
  return { email: email.trim() }
}

export function toResetPasswordDto(body) {
  const { token, newPassword } = body ?? {}
  if (typeof token !== 'string' || !token) throw new FieldError('token', 'Reset token is required.')
  if (typeof newPassword !== 'string' || !newPassword) throw new FieldError('newPassword', 'New password is required.')
  return { token, newPassword }
}

export const toLoginResponse = ({ accessToken, refreshToken, expiresIn, user }) => ({ accessToken, refreshToken, expiresIn, user })
