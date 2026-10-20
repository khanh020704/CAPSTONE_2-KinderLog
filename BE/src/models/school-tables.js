// The tables of the school's database (Users ... Audit_Logs) with the columns migrations 002-004 added.
// Field names are the code's; columns are the PascalCase of the field unless given.
import { defineTable } from '../db/table.js'
import { created, todayISO, updated } from './helpers.js'

export const USER_ROLES = ['ADMIN', 'TEACHER', 'PARENT']
export const GENDERS = ['Male', 'Female', 'Other']
export const RELATIONSHIPS = ['Cha', 'Mẹ', 'Ông', 'Bà', 'Người giám hộ', 'Khác']
export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Excused']
export const JOURNAL_STATUSES = ['DRAFT', 'APPROVED', 'REJECTED']
export const INPUT_METHODS = ['VOICE', 'MANUAL', 'BULK']
export const NOTIFICATION_TYPES = ['JOURNAL_NEW', 'HEALTH_ALERT', 'SYSTEM', 'FEEDBACK', 'MESSAGE', 'ANNOUNCEMENT']
export const AUDIT_STATUSES = ['Success', 'Failed']

const id = (ref, options = {}) => ({ type: 'id', ref, ...options })

export const User = defineTable({
  name: 'User',
  table: 'Users',
  key: 'UserID',
  fields: {
    username: { type: 'string', max: 50, required: true },
    // Left out of query results; ask for it with { hidden: true } when checking a password.
    passwordHash: { type: 'string', max: 255, required: true, hidden: true },
    fullName: { type: 'string', max: 100, required: true },
    email: { type: 'string', max: 150 },
    phoneNumber: { type: 'string', max: 15 },
    role: { type: 'string', enum: USER_ROLES, required: true },
    avatarUrl: { type: 'string', max: 500 },
    isActive: { type: 'bool', required: true, default: true },
    isLocked: { type: 'bool', required: true, default: false },
    lastLoginAt: { type: 'datetime' },
    createdAt: created(),
    updatedAt: updated(),
  },
  uniques: { UQ_Users_Username: ['username'], UX_Users_Email: ['email'], UX_Users_Phone: ['phoneNumber'] },
})

export const School = defineTable({
  name: 'School',
  table: 'Schools',
  key: 'SchoolID',
  fields: {
    schoolCode: { type: 'string', max: 20, required: true },
    schoolName: { type: 'string', max: 200, required: true },
    address: { type: 'string', max: 300 },
    phone: { type: 'string', max: 15 },
    email: { type: 'string', max: 150 },
    principalId: id('User'),
    isActive: { type: 'bool', required: true, default: true },
    createdAt: created(),
  },
  // The backup created this constraint without a name, so SQL Server named it UQ__Schools__...
  uniques: { UQ__Schools__: ['schoolCode'] },
})

export const Class = defineTable({
  name: 'Class',
  table: 'Classes',
  key: 'ClassID',
  fields: {
    classCode: { type: 'string', max: 20, required: true },
    className: { type: 'string', max: 100, required: true },
    gradeLevel: { type: 'string', max: 50, required: true },
    schoolYear: { type: 'string', max: 20, required: true },
    teacherId: id('User'),
    roomName: { type: 'string', max: 50 },
    maxCapacity: { type: 'int', required: true, default: 30 },
    isActive: { type: 'bool', required: true, default: true },
    createdAt: created(),
    updatedAt: updated(),
  },
  uniques: { UQ_Classes_Code: ['classCode', 'schoolYear'] },
})

export const Student = defineTable({
  name: 'Student',
  table: 'Students',
  key: 'StudentID',
  fields: {
    studentCode: { type: 'string', max: 20, required: true },
    fullName: { type: 'string', max: 100, required: true },
    nickname: { type: 'string', max: 50 },
    dateOfBirth: { type: 'date', required: true },
    gender: { type: 'string', enum: GENDERS, required: true },
    classId: id('Class'),
    allergyHistory: { type: 'string', max: 500 },
    healthNote: { type: 'string', max: 500 },
    photoUrl: { type: 'string', max: 500 },
    enrollmentDate: { type: 'date', required: true, default: todayISO },
    isActive: { type: 'bool', required: true, default: true },
    createdAt: created(),
    updatedAt: updated(),
  },
  uniques: { UQ_Students_Code: ['studentCode'] },
})

export const ParentStudentMap = defineTable({
  name: 'ParentStudentMap',
  table: 'Parent_Student_Map',
  key: 'MapID',
  fields: {
    parentId: id('User', { required: true }),
    studentId: id('Student', { required: true }),
    relationship: { type: 'string', enum: RELATIONSHIPS, required: true },
    isPrimary: { type: 'bool', required: true, default: false },
    canPickup: { type: 'bool', required: true, default: true },
    // Only active links let a parent see the child, and let the teacher and parent message each other.
    isActive: { type: 'bool', required: true, default: true },
    createdAt: created(),
  },
  uniques: { UQ_PSM_Parent_Student: ['parentId', 'studentId'] },
})

export const Attendance = defineTable({
  name: 'Attendance',
  table: 'Attendance',
  key: 'AttendanceID',
  fields: {
    studentId: id('Student', { required: true }),
    classId: id('Class', { required: true }),
    attendanceDate: { type: 'date', required: true },
    status: { type: 'string', enum: ATTENDANCE_STATUSES, required: true },
    note: { type: 'string', max: 255 },
    recordedBy: id('User', { column: 'RecordedBy' }),
    createdAt: created(),
    updatedAt: updated(),
  },
  uniques: { UQ_Attendance_Student_Date: ['studentId', 'attendanceDate'] },
})

// A child's own journal from the school's original design. Kept for the admin endpoints;
// the teacher works with the class journal (ClassDailySummary).
export const DailyJournal = defineTable({
  name: 'DailyJournal',
  table: 'Daily_Journals',
  key: 'JournalID',
  fields: {
    studentId: id('Student', { required: true }),
    classId: id('Class', { required: true }),
    journalDate: { type: 'date', required: true },
    mealDetail: { type: 'string', max: 500 },
    sleepDetail: { type: 'string', max: 500 },
    studyDetail: { type: 'string', max: 500 },
    playDetail: { type: 'string', max: 500 },
    healthDetail: { type: 'string', max: 500 },
    emotionDetail: { type: 'string', max: 500 },
    symptoms: { type: 'string', max: 500 },
    status: { type: 'string', enum: JOURNAL_STATUSES, required: true, default: 'DRAFT' },
    isException: { type: 'bool', required: true, default: false },
    inputMethod: { type: 'string', enum: INPUT_METHODS },
    rawTranscript: { type: 'text' },
    aiJsonResult: { type: 'text', column: 'AIJsonResult' },
    createdBy: id('User', { column: 'CreatedBy' }),
    approvedBy: id('User', { column: 'ApprovedBy' }),
    approvedAt: { type: 'datetime' },
    createdAt: created(),
    updatedAt: updated(),
  },
  uniques: { UQ_DJ_Student_Date: ['studentId', 'journalDate'] },
})

export const Feedback = defineTable({
  name: 'Feedback',
  table: 'Feedbacks',
  key: 'FeedbackID',
  fields: {
    journalId: id('DailyJournal', { required: true }),
    parentId: id('User', { required: true }),
    content: { type: 'string', max: 1000 },
    isRead: { type: 'bool', required: true, default: false },
    createdAt: created(),
  },
})

// A photo belongs to a child's journal or to a class journal.
export const JournalPhoto = defineTable({
  name: 'JournalPhoto',
  table: 'Journal_Photos',
  key: 'PhotoID',
  defaultOrder: [['id', 'ASC']],
  fields: {
    journalId: id('DailyJournal'),
    summaryId: id('ClassDailySummary'),
    classId: id('Class', { required: true }),
    photoUrl: { type: 'string', max: 500, required: true },
    caption: { type: 'string', max: 255 },
    isApproved: { type: 'bool', required: true, default: false },
    uploadedBy: id('User', { column: 'UploadedBy' }),
    uploadedAt: created('UploadedAt'),
  },
  validate: (photo) => (photo.journalId == null && photo.summaryId == null ? { journalId: 'A photo needs a journalId or a summaryId.' } : null),
})

export const Notification = defineTable({
  name: 'Notification',
  table: 'Notifications',
  key: 'NotificationID',
  fields: {
    userId: id('User', { required: true }),
    studentId: id('Student'),
    journalId: id('DailyJournal'),
    // The class journal a JOURNAL_NEW notification points to.
    summaryId: id('ClassDailySummary'),
    title: { type: 'string', max: 200, required: true },
    content: { type: 'string', max: 1000 },
    type: { type: 'string', enum: NOTIFICATION_TYPES, required: true },
    isRead: { type: 'bool', required: true, default: false },
    readAt: { type: 'datetime' },
    sentAt: created('SentAt'),
  },
})

export const AiProcessingLog = defineTable({
  name: 'AiProcessingLog',
  table: 'AI_Processing_Logs',
  key: 'LogID',
  fields: {
    userId: id('User'),
    audioUrl: { type: 'string', max: 500 },
    rawTranscript: { type: 'text' },
    extractedJson: { type: 'text' },
    asrProvider: { type: 'string', max: 50, column: 'ASRProvider' },
    llmModel: { type: 'string', max: 50, column: 'LLMModel' },
    processingMs: { type: 'int' },
    isSuccess: { type: 'bool', required: true, default: true },
    errorMessage: { type: 'string', max: 1000 },
    createdAt: created(),
  },
})

export const AuditLog = defineTable({
  name: 'AuditLog',
  table: 'Audit_Logs',
  key: 'AuditID',
  fields: {
    userId: id('User'),
    action: { type: 'string', max: 100, required: true },
    entityName: { type: 'string', max: 50 },
    entityId: { type: 'string', max: 50, column: 'EntityID' },
    description: { type: 'string', max: 1000 },
    ipAddress: { type: 'string', max: 45 },
    status: { type: 'string', enum: AUDIT_STATUSES, required: true, default: 'Success' },
    createdAt: created(),
  },
})
