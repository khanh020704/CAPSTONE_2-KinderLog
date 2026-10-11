import { BadRequestError } from '../utils/errors.js'
import { isEmail, isPhone, toMillis } from '../utils/text.js'

const ROLE_LABELS = { ADMIN: 'System Admin', TEACHER: 'Teacher', PARENT: 'Parent' }

export const accountStatus = (user) => (user.isLocked ? 'Locked' : user.isActive ? 'Active' : 'Inactive')

// The signed-in user as the frontend knows it (Md/API.md, section 3.1).
// `extra` carries what depends on the role: the teacher's class or the parent's children.
export const toAccountResponse = (user, extra = {}) => ({
  id: String(user.id ?? user._id),
  role: user.role.toLowerCase(),
  roleLabel: ROLE_LABELS[user.role],
  username: user.username,
  name: user.fullName,
  phone: user.phoneNumber ?? null,
  email: user.email ?? null,
  avatarUrl: user.avatarUrl ?? null,
  status: accountStatus(user),
  createdAt: toMillis(user.createdAt),
  lastLogin: toMillis(user.lastLoginAt),
  ...extra,
})

export function toUpdateProfileDto(body) {
  const { name, phone, email } = body ?? {}
  const fields = {}
  if (typeof name !== 'string' || !name.trim()) fields.name = 'Full Name is required.'
  if (typeof phone !== 'string' || !phone.trim()) fields.phone = 'Phone is required.'
  else if (!isPhone(phone)) fields.phone = 'Enter a 10-digit phone number starting with 0.'
  if (typeof email !== 'string' || !email.trim()) fields.email = 'Email is required.'
  else if (!isEmail(email)) fields.email = 'Enter a valid email address.'
  if (Object.keys(fields).length) throw new BadRequestError('Some fields are invalid.', fields)
  return { fullName: name.trim(), phoneNumber: phone.trim(), email: email.trim() }
}

export function toChangePasswordDto(body) {
  const { currentPassword, newPassword } = body ?? {}
  const fields = {}
  if (typeof currentPassword !== 'string' || !currentPassword) fields.currentPassword = 'Current Password is required.'
  if (typeof newPassword !== 'string' || !newPassword) fields.newPassword = 'New Password is required.'
  if (Object.keys(fields).length) throw new BadRequestError('Some fields are invalid.', fields)
  return { currentPassword, newPassword }
}
