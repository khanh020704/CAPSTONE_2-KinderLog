// Who may see what. Every teacher and parent endpoint goes through these helpers,
// so the rules live in one place: a teacher works with the class they lead, and a
// parent is connected to a child only through an active link.
// Each helper reads through the caller's unit of work, so it sees what the caller's transaction sees.
import { UnitOfWork } from '../../db/unit-of-work.js'
import { NotFoundError } from '../../utils/errors.js'

// The class a teacher leads. A teacher leads one class; if several are assigned, the newest active one counts.
export const findTeacherClass = (uow, teacherId) =>
  uow.classes.findOne({ teacherId, isActive: true }, { orderBy: [['createdAt', 'DESC'], ['id', 'DESC']] })

export async function requireTeacherClass(uow, teacherId) {
  const cls = await findTeacherClass(uow, teacherId)
  if (!cls) throw new NotFoundError('You have not been assigned to a class yet.', 'NO_CLASS')
  return cls
}

// By name, letter by letter (code point order), the same on every server whatever its collation.
const byName = (a, b) => (a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : Number(a.id) - Number(b.id))

export const activeStudentsOf = async (uow, classId) => (await uow.students.find({ classId, isActive: true })).sort(byName)

// Active parent links of the given students, each with its `parent` user. Inactive parents are left out.
export async function activeParentLinksOf(uow, studentIds) {
  if (!studentIds.length) return []
  const links = await uow.parentLinks.find({ studentId: studentIds, isActive: true }, { orderBy: [['isPrimary', 'DESC'], ['createdAt', 'ASC'], ['id', 'ASC']] })
  const parents = links.length ? await uow.users.find({ id: [...new Set(links.map((l) => l.parentId))], isActive: true }) : []
  return links.map((link) => ({ ...link, parent: parents.find((p) => p.id === link.parentId) })).filter((link) => link.parent)
}

// One notification per receiver, in a unit of work of its own: a failure is logged, not thrown, because the
// action that caused it has already been saved.
export async function notifyUsers(userIds, notification) {
  const unique = [...new Set(userIds.map(String))]
  if (!unique.length) return
  try {
    await UnitOfWork.run(async (uow) => {
      for (const userId of unique) await uow.notifications.insert({ ...notification, userId })
    })
  } catch (err) {
    console.error(`Could not create notifications: ${err.message}`)
  }
}
