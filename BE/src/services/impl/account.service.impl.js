import { Class, ParentStudentMap, RefreshToken, User } from '../../models/index.js'
import { toAccountResponse } from '../../dtos/account.dto.js'
import { toClassRef, toRelationshipLabel } from '../../dtos/teacher.dto.js'
import { recordAudit } from '../../utils/audit.js'
import { ConflictError, FieldError, UnauthenticatedError } from '../../utils/errors.js'
import { hashPassword, verifyPassword } from '../../utils/password.js'
import AccountService from '../account.service.js'
import { findTeacherClass } from './scope.js'
import settingsService from './settings.service.impl.js'

// What a profile shows beyond the account itself.
async function roleDetails(user) {
  if (user.role === 'TEACHER') return { class: toClassRef(await findTeacherClass(user.id)) }
  if (user.role !== 'PARENT') return {}

  const links = await ParentStudentMap.find({ parentId: user.id, isActive: true }).populate('student')
  const active = links.filter((link) => link.student?.isActive)
  const classes = await Class.find({ _id: { $in: active.map((link) => link.student.classId).filter(Boolean) } })
  const className = (classId) => classes.find((c) => c._id.equals(classId))?.className ?? null
  return {
    children: active.map((link) => ({
      id: String(link.student._id),
      name: link.student.fullName,
      classId: link.student.classId ? String(link.student.classId) : null,
      className: className(link.student.classId),
      relationship: toRelationshipLabel(link.relationship),
    })),
  }
}

class AccountServiceImpl extends AccountService {
  async getProfile(user) {
    return toAccountResponse(user, await roleDetails(user))
  }

  async updateProfile(user, dto) {
    const taken = await User.findOne({
      _id: { $ne: user.id },
      $or: [{ phoneNumber: dto.phoneNumber }, { email: dto.email }],
    }).collation({ locale: 'en', strength: 2 })
    if (taken?.phoneNumber === dto.phoneNumber) {
      throw new ConflictError('This phone number is already in use.', 'PHONE_TAKEN', { phone: 'This phone number is already in use.' })
    }
    if (taken) throw new ConflictError('This email is already in use.', 'EMAIL_TAKEN', { email: 'This email is already in use.' })

    const doc = await User.findByIdAndUpdate(user.id, dto, { returnDocument: 'after', runValidators: true })
    await recordAudit({ userId: user.id, action: 'Update', module: 'Profile', description: 'Profile information updated' })
    return this.getProfile(doc)
  }

  async changePassword(user, { currentPassword, newPassword }) {
    const doc = await User.findById(user.id).select('+passwordHash')
    if (!doc || !(await verifyPassword(currentPassword, doc.passwordHash))) {
      throw new FieldError('currentPassword', 'Current password is incorrect.')
    }
    const { passwordMin } = await settingsService.get()
    if (newPassword.length < passwordMin) throw new FieldError('newPassword', `Password must be at least ${passwordMin} characters.`)
    if (newPassword === currentPassword) throw new FieldError('newPassword', 'New password must be different from the current one.')

    doc.passwordHash = await hashPassword(newPassword)
    await doc.save()
    // Other devices have to sign in again with the new password.
    await RefreshToken.updateMany({ userId: user.id, revokedAt: null }, { revokedAt: new Date() })
    await recordAudit({ userId: user.id, action: 'Update', module: 'Authentication', description: 'Password changed' })
  }

  // A session ends as soon as the account is deactivated, locked or deleted.
  async requireUsable(userId) {
    const doc = await User.findById(userId)
    if (!doc || !doc.isActive || doc.isLocked) throw new UnauthenticatedError('This account is no longer available.')
    return doc
  }
}

export default new AccountServiceImpl()
