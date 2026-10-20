import { UnitOfWork } from '../../db/unit-of-work.js'
import { toAccountResponse } from '../../dtos/account.dto.js'
import { toClassRef, toRelationshipLabel } from '../../dtos/teacher.dto.js'
import { recordAudit } from '../../utils/audit.js'
import { ConflictError, FieldError, UnauthenticatedError } from '../../utils/errors.js'
import { hashPassword, verifyPassword } from '../../utils/password.js'
import AccountService from '../account.service.js'
import { findTeacherClass } from './scope.js'
import settingsService from './settings.service.impl.js'

// What a profile shows beyond the account itself.
async function roleDetails(uow, user) {
  if (user.role === 'TEACHER') return { class: toClassRef(await findTeacherClass(uow, user.id)) }
  if (user.role !== 'PARENT') return {}

  const links = await uow.parentLinks.find({ parentId: user.id, isActive: true }, { orderBy: [['id', 'ASC']] })
  const students = links.length ? await uow.students.find({ id: links.map((link) => link.studentId), isActive: true }) : []
  const active = links.map((link) => ({ ...link, student: students.find((s) => s.id === link.studentId) })).filter((link) => link.student)
  const classIds = [...new Set(active.map((link) => link.student.classId).filter(Boolean))]
  const classes = classIds.length ? await uow.classes.find({ id: classIds }) : []
  const className = (classId) => classes.find((c) => c.id === classId)?.className ?? null
  return {
    children: active.map((link) => ({
      id: link.student.id,
      name: link.student.fullName,
      classId: link.student.classId ? String(link.student.classId) : null,
      className: className(link.student.classId),
      relationship: toRelationshipLabel(link.relationship),
    })),
  }
}

class AccountServiceImpl extends AccountService {
  async getProfile(user) {
    return toAccountResponse(user, await roleDetails(UnitOfWork.read(), user))
  }

  async updateProfile(user, dto) {
    // The database compares text without regard to case, so "An@Mail.vn" and "an@mail.vn" are the same address.
    // Checked and saved in one transaction.
    const doc = await UnitOfWork.run(async (uow) => {
      const taken = await uow.users.findOne({
        id: { $ne: user.id },
        $or: [{ phoneNumber: dto.phoneNumber }, { email: dto.email }],
      })
      if (taken?.phoneNumber === dto.phoneNumber) {
        throw new ConflictError('This phone number is already in use.', 'PHONE_TAKEN', { phone: 'This phone number is already in use.' })
      }
      if (taken) throw new ConflictError('This email is already in use.', 'EMAIL_TAKEN', { email: 'This email is already in use.' })
      return uow.users.updateById(user.id, dto)
    })
    await recordAudit({ userId: user.id, action: 'Update', module: 'Profile', description: 'Profile information updated' })
    return this.getProfile(doc)
  }

  async changePassword(user, { currentPassword, newPassword }) {
    const doc = await UnitOfWork.read().users.findById(user.id, { hidden: true })
    if (!doc || !(await verifyPassword(currentPassword, doc.passwordHash))) {
      throw new FieldError('currentPassword', 'Current password is incorrect.')
    }
    const { passwordMin } = await settingsService.get()
    if (newPassword.length < passwordMin) throw new FieldError('newPassword', `Password must be at least ${passwordMin} characters.`)
    if (newPassword === currentPassword) throw new FieldError('newPassword', 'New password must be different from the current one.')

    const passwordHash = await hashPassword(newPassword)
    // The new password and the end of every other session are saved together; other devices sign in again.
    await UnitOfWork.run(async (uow) => {
      await uow.users.update({ id: user.id }, { passwordHash })
      await uow.refreshTokens.update({ userId: user.id, revokedAt: null }, { revokedAt: new Date() })
    })
    await recordAudit({ userId: user.id, action: 'Update', module: 'Authentication', description: 'Password changed' })
  }

  // A session ends as soon as the account is deactivated, locked or deleted.
  async requireUsable(userId, uow = UnitOfWork.read()) {
    const doc = await uow.users.findById(userId)
    if (!doc || !doc.isActive || doc.isLocked) throw new UnauthenticatedError('This account is no longer available.')
    return doc
  }
}

export default new AccountServiceImpl()
