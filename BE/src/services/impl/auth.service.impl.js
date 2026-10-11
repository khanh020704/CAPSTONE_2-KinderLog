import jwt from 'jsonwebtoken'
import { PasswordResetToken, RefreshToken, User } from '../../models/index.js'
import { JWT_EXPIRES_SECONDS, jwtSecret } from '../../config/auth.js'
import { toLoginResponse } from '../../dtos/auth.dto.js'
import { toUserResponse } from '../../dtos/user.dto.js'
import { recordAudit } from '../../utils/audit.js'
import { FieldError, ForbiddenError, HttpError, NotFoundError, UnauthenticatedError } from '../../utils/errors.js'
import { sendMail } from '../../utils/mailer.js'
import { hashPassword, verifyPassword } from '../../utils/password.js'
import { hashToken, randomToken } from '../../utils/tokens.js'
import AuthService from '../auth.service.js'
import accountService from './account.service.impl.js'
import settingsService from './settings.service.impl.js'

const DAY = 24 * 60 * 60 * 1000
const REFRESH_LIFETIME = DAY // a normal session
const REMEMBERED_LIFETIME = 30 * DAY // "Remember me"
const RESET_LIFETIME = 60 * 60 * 1000

const invalidCredentials = () => new UnauthenticatedError('Incorrect phone number or password.', 'INVALID_CREDENTIALS')
const invalidRefreshToken = () => new UnauthenticatedError('The session has expired. Please sign in again.')

const signAccessToken = (user) =>
  jwt.sign({ role: user.role }, jwtSecret(), { subject: String(user._id), expiresIn: JWT_EXPIRES_SECONDS })

async function issueTokens(user, refreshExpiresAt) {
  const refreshToken = randomToken()
  await RefreshToken.create({ userId: user._id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt })
  return { accessToken: signAccessToken(user), refreshToken, expiresIn: JWT_EXPIRES_SECONDS }
}

class AuthServiceImpl extends AuthService {
  async login({ phone, username, password, role, remember }) {
    const user = await User.findOne(phone ? { phoneNumber: phone } : { username }).select('+passwordHash')
    // A wrong role is reported like a wrong password, so the form does not reveal which accounts exist.
    if (!user || (role && user.role !== role) || !(await verifyPassword(password, user.passwordHash))) throw invalidCredentials()

    if (user.isLocked || !user.isActive) {
      const state = user.isLocked ? 'locked' : 'inactive'
      await recordAudit({ userId: user._id, action: 'Login', module: 'Authentication', description: `Sign-in blocked: account is ${state}`, status: 'Failed' })
      const contact = user.role === 'ADMIN' ? 'the system administrator' : 'your school'
      throw new ForbiddenError(`This account is ${state}. Please contact ${contact}.`, user.isLocked ? 'ACCOUNT_LOCKED' : 'ACCOUNT_INACTIVE')
    }

    user.lastLoginAt = new Date()
    await user.save()
    const tokens = await issueTokens(user, new Date(Date.now() + (remember ? REMEMBERED_LIFETIME : REFRESH_LIFETIME)))
    return toLoginResponse({ ...tokens, user: await accountService.getProfile(toUserResponse(user)) })
  }

  async refresh({ refreshToken }) {
    // Claimed in one step, so a token cannot be exchanged twice.
    const stored = await RefreshToken.findOneAndUpdate(
      { tokenHash: hashToken(refreshToken), revokedAt: null, expiresAt: { $gt: new Date() } },
      { revokedAt: new Date() },
    )
    if (!stored) throw invalidRefreshToken()
    const user = await accountService.requireUsable(stored.userId)
    return issueTokens(user, stored.expiresAt)
  }

  async logout(user, { refreshToken }) {
    const filter = { userId: user.id, revokedAt: null, ...(refreshToken && { tokenHash: hashToken(refreshToken) }) }
    await RefreshToken.updateMany(filter, { revokedAt: new Date() })
  }

  async forgotPassword({ email }) {
    const user = await User.findOne({ email }).collation({ locale: 'en', strength: 2 })
    if (!user) throw new NotFoundError("We couldn't find an account with this email address.", 'EMAIL_NOT_FOUND')

    const token = randomToken()
    await PasswordResetToken.create({ userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_LIFETIME) })
    const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`
    await sendMail({
      to: user.email,
      subject: 'Reset your KinderLog password',
      text: `Hello ${user.fullName},\nOpen this link within one hour to choose a new password:\n${link}`,
    })
    return { sent: true }
  }

  async resetPassword({ token, newPassword }) {
    const { passwordMin } = await settingsService.get()
    if (newPassword.length < passwordMin) throw new FieldError('newPassword', `Password must be at least ${passwordMin} characters.`)

    // Claimed in one step, so a reset link works once.
    const stored = await PasswordResetToken.findOneAndUpdate(
      { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
    )
    if (!stored) throw new HttpError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired.')

    await User.updateOne({ _id: stored.userId }, { passwordHash: await hashPassword(newPassword) })
    await RefreshToken.updateMany({ userId: stored.userId, revokedAt: null }, { revokedAt: new Date() })
    await recordAudit({ userId: stored.userId, action: 'Update', module: 'Authentication', description: 'Password reset' })
  }

  async authenticate(token) {
    let payload
    try {
      payload = jwt.verify(token, jwtSecret())
    } catch {
      throw new UnauthenticatedError('The access token is invalid or has expired.')
    }
    // Looked up on every request, so a deactivated, locked or deleted account loses access immediately.
    return toUserResponse(await accountService.requireUsable(payload.sub))
  }
}

export default new AuthServiceImpl()
