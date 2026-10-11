// Who may see what. Every teacher and parent endpoint goes through these helpers,
// so the rules live in one place: a teacher works with the class they lead, and a
// parent is connected to a child only through an active link.
import { Class, Notification, ParentStudentMap, Student } from '../../models/index.js'
import { NotFoundError } from '../../utils/errors.js'

// The class a teacher leads. A teacher leads one class; if several are assigned, the newest active one counts.
export const findTeacherClass = (teacherId) => Class.findOne({ teacherId, isActive: true }).sort({ createdAt: -1 })

export async function requireTeacherClass(teacherId) {
  const cls = await findTeacherClass(teacherId)
  if (!cls) throw new NotFoundError('You have not been assigned to a class yet.', 'NO_CLASS')
  return cls
}

export const activeStudentsOf = (classId) => Student.find({ classId, isActive: true }).sort({ fullName: 1 })

// Active parent links of the given students, each with its `parent` user loaded. Inactive parents are left out.
export async function activeParentLinksOf(studentIds) {
  const links = await ParentStudentMap.find({ studentId: { $in: studentIds }, isActive: true })
    .sort({ isPrimary: -1, createdAt: 1 })
    .populate('parent')
  return links.filter((link) => link.parent?.isActive)
}

// One notification per receiver. Failures are logged, not thrown: the action that caused them already succeeded.
export async function notifyUsers(userIds, notification) {
  const unique = [...new Set(userIds.map(String))]
  if (!unique.length) return
  try {
    await Notification.insertMany(unique.map((userId) => ({ ...notification, userId })))
  } catch (err) {
    console.error(`Could not create notifications: ${err.message}`)
  }
}
