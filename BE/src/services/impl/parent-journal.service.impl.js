import { UnitOfWork } from '../../db/unit-of-work.js'
import { toParentJournalListItem, toParentJournalResponse } from '../../dtos/parent-journal.dto.js'
import { ForbiddenError, NotFoundError } from '../../utils/errors.js'
import ParentJournalService from '../parent-journal.service.js'

// Only journals that were published at least once (they have a published version); an edit not yet
// published again is not shown.
const PUBLISHED = { revision: { $gt: 0 } }

// The child, when the signed-in parent has an active link to them and the child is still at the school
// (the same children GET /me lists).
async function requireOwnChild(uow, user, studentId) {
  const link = await uow.parentLinks.exists({ parentId: user.id, studentId, isActive: true })
  const student = link && (await uow.students.findOne({ id: studentId, isActive: true }))
  if (!student) throw new ForbiddenError('You can only see the journals of your own children.')
  return student
}

// 'YYYY-MM' -> its last day, as a date column only takes real dates.
function lastDayOf(month) {
  const [year, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, '0')}`
}

class ParentJournalServiceImpl extends ParentJournalService {
  async list(user, { studentId, month }) {
    const uow = UnitOfWork.read()
    const student = await requireOwnChild(uow, user, studentId)
    if (!student.classId) return { items: [] }
    const filter = { classId: student.classId, ...PUBLISHED }
    if (month) filter.summaryDate = { $gte: `${month}-01`, $lte: lastDayOf(month) }
    const summaries = await uow.journals.load(await uow.journals.find(filter, { orderBy: [['summaryDate', 'DESC']] }))
    return { items: summaries.map(toParentJournalListItem) }
  }

  async byDate(user, { studentId, date }) {
    const uow = UnitOfWork.read()
    const student = await requireOwnChild(uow, user, studentId)
    const summary = student.classId && (await uow.journals.findOne({ classId: student.classId, summaryDate: date, ...PUBLISHED }))
    if (!summary) throw new NotFoundError('There is no journal for this day.')
    const attendance = await uow.attendance.findOne({ studentId: student.id, attendanceDate: date })
    return toParentJournalResponse(summary, student.id, attendance)
  }
}

export default new ParentJournalServiceImpl()
