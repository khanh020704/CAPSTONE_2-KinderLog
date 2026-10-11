import { Attendance, ClassDailySummary, Message } from '../../models/index.js'
import { todayISO } from '../../models/helpers.js'
import { toAttendanceCounts, toApiAttendanceStatus } from '../../dtos/attendance-sheet.dto.js'
import { toClassRosterResponse, toDashboardResponse, toRosterParent, toRosterStudent } from '../../dtos/teacher.dto.js'
import TeacherService from '../teacher.service.js'
import { activeParentLinksOf, activeStudentsOf, findTeacherClass, requireTeacherClass } from './scope.js'

class TeacherServiceImpl extends TeacherService {
  async getClass(user) {
    const cls = await requireTeacherClass(user.id)
    const students = await activeStudentsOf(cls._id)
    const studentIds = students.map((s) => s._id)
    const [links, attendance] = await Promise.all([
      activeParentLinksOf(studentIds),
      Attendance.find({ studentId: { $in: studentIds }, attendanceDate: todayISO() }),
    ])

    return toClassRosterResponse(
      cls,
      students.map((student) => {
        const today = attendance.find((a) => a.studentId.equals(student._id))
        const parents = links.filter((l) => l.studentId.equals(student._id)).map((l) => toRosterParent(l, l.parent))
        return toRosterStudent(student, today ? toApiAttendanceStatus(today.status) : null, parents)
      }),
    )
  }

  async getDashboard(user) {
    const date = todayISO()
    const cls = await findTeacherClass(user.id)
    if (!cls) return toDashboardResponse({ date, cls: null })

    const students = await activeStudentsOf(cls._id)
    const [attendance, journal, pendingReviews, unreadMessages] = await Promise.all([
      Attendance.find({ studentId: { $in: students.map((s) => s._id) }, attendanceDate: date }),
      ClassDailySummary.findOne({ classId: cls._id, summaryDate: date }),
      ClassDailySummary.countDocuments({ classId: cls._id, status: 'REVIEW' }),
      Message.countDocuments({ teacherId: user.id, senderRole: 'PARENT', isRead: false }),
    ])

    return toDashboardResponse({
      date,
      cls,
      students: students.length,
      attendance: toAttendanceCounts(students.length, attendance),
      journal: journal ? { id: String(journal._id), status: journal.status.toLowerCase() } : null,
      pendingReviews,
      unreadMessages,
    })
  }
}

export default new TeacherServiceImpl()
