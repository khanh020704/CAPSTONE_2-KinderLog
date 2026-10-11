// Importing every model here registers it with Mongoose, so relations can be populated by name.
import User from './User.js'
import School from './School.js'
import Class from './Class.js'
import Student from './Student.js'
import ParentStudentMap from './ParentStudentMap.js'
import Attendance from './Attendance.js'
import ClassDailySummary from './ClassDailySummary.js'
import DailyJournal from './DailyJournal.js'
import JournalPhoto from './JournalPhoto.js'
import Feedback from './Feedback.js'
import Notification from './Notification.js'
import AiProcessingLog from './AiProcessingLog.js'
import AuditLog from './AuditLog.js'
import Message from './Message.js'
import SystemSetting from './SystemSetting.js'
import RefreshToken from './RefreshToken.js'
import PasswordResetToken from './PasswordResetToken.js'

export {
  User,
  School,
  Class,
  Student,
  ParentStudentMap,
  Attendance,
  ClassDailySummary,
  DailyJournal,
  JournalPhoto,
  Feedback,
  Notification,
  AiProcessingLog,
  AuditLog,
  Message,
  SystemSetting,
  RefreshToken,
  PasswordResetToken,
}
