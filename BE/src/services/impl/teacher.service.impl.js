import { UnitOfWork } from '../../db/unit-of-work.js'
import { todayISO } from '../../models/helpers.js'
import { toAttendanceCounts, toApiAttendanceStatus } from '../../dtos/attendance-sheet.dto.js'
import { toClassRosterResponse, toDashboardResponse, toRosterParent, toRosterStudent } from '../../dtos/teacher.dto.js'
import TeacherService from '../teacher.service.js'
import { activeParentLinksOf, activeStudentsOf, findTeacherClass, requireTeacherClass } from './scope.js'

class TeacherServiceImpl extends TeacherService {
  async getClass(user) {
    const uow = UnitOfWork.read()
    const cls = await requireTeacherClass(uow, user.id)
    const students = await activeStudentsOf(uow, cls.id)
    const studentIds = students.map((s) => s.id)
    const links = await activeParentLinksOf(uow, studentIds)
    const attendance = studentIds.length ? await uow.attendance.find({ studentId: studentIds, attendanceDate: todayISO() }) : []

    return toClassRosterResponse(
      cls,
      students.map((student) => {
        const today = attendance.find((a) => a.studentId === student.id)
        const parents = links.filter((l) => l.studentId === student.id).map((l) => toRosterParent(l, l.parent))
        return toRosterStudent(student, today ? toApiAttendanceStatus(today.status) : null, parents)
      }),
    )
  }

  async getDashboard(user) {
    const uow = UnitOfWork.read()
    const date = todayISO()
    const cls = await findTeacherClass(uow, user.id)
    if (!cls) return toDashboardResponse({ date, cls: null })

    const students = await activeStudentsOf(uow, cls.id)
    const attendance = students.length ? await uow.attendance.find({ studentId: students.map((s) => s.id), attendanceDate: date }) : []
    const journal = await uow.journals.findRow({ classId: cls.id, summaryDate: date })
    const pendingReviews = await uow.journals.count({ classId: cls.id, status: 'REVIEW' })
    const unreadMessages = await uow.messages.count({ teacherId: user.id, senderRole: 'PARENT', isRead: false })

    return toDashboardResponse({
      date,
      cls,
      students: students.length,
      attendance: toAttendanceCounts(students.length, attendance),
      journal: journal ? { id: journal.id, status: journal.status.toLowerCase() } : null,
      pendingReviews,
      unreadMessages,
    })
  }
}

export default new TeacherServiceImpl()
