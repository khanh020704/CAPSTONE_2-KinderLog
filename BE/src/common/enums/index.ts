export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  PRINCIPAL = 'PRINCIPAL',
  TEACHER = 'TEACHER',
  PARENT = 'PARENT',
}

export enum RecordStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LOCKED = 'LOCKED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum Relationship {
  MOTHER = 'MOTHER',
  FATHER = 'FATHER',
  GRANDMOTHER = 'GRANDMOTHER',
  GRANDFATHER = 'GRANDFATHER',
  GUARDIAN = 'GUARDIAN',
}

/**
 * DRAFT (teacher writing) → PENDING (sent to the principal) → APPROVED (principal checked it) → PUBLISHED (parents
 * can see it). Editing never moves an entry backwards: corrections to a published entry reach parents at once.
 */
export enum JournalStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
}

/** A class journal: written by hand (DRAFT) or made from a recording (REVIEW) → APPROVED → PUBLISHED. */
export enum ClassJournalStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
}

export enum JournalSource {
  MANUAL = 'MANUAL',
  BULK = 'BULK',
  VOICE = 'VOICE',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
}

/** Kind of an ABSENT day (User Story 2.11: Present, Excused Absence, Unexcused Absence). */
export enum AbsenceType {
  EXCUSED = 'EXCUSED',
  UNEXCUSED = 'UNEXCUSED',
}

/** How much of the meal the child ate – drives the nutrition dashboard. */
export enum MealLevel {
  ALL = 'ALL',
  MOST = 'MOST',
  HALF = 'HALF',
  LITTLE = 'LITTLE',
  NONE = 'NONE',
}

export enum SleepQuality {
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  NONE = 'NONE',
}

export enum HealthStatus {
  NORMAL = 'NORMAL',
  MONITOR = 'MONITOR',
  SICK = 'SICK',
}

export enum Mood {
  HAPPY = 'HAPPY',
  CALM = 'CALM',
  TIRED = 'TIRED',
  SAD = 'SAD',
}

/** At most one ACTIVE (current) academic year per school; the service deactivates the previous one. */
export enum AcademicYearStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum AnnouncementStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export enum AnnouncementAudience {
  ALL = 'ALL',
  TEACHERS = 'TEACHERS',
  PARENTS = 'PARENTS',
}

export enum AnnouncementCategory {
  HOLIDAY = 'HOLIDAY',
  ACTIVITY = 'ACTIVITY',
  NOTICE = 'NOTICE',
  REMINDER = 'REMINDER',
}

export enum NotificationType {
  JOURNAL = 'JOURNAL',
  MESSAGE = 'MESSAGE',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  CAMERA = 'CAMERA',
  SYSTEM = 'SYSTEM',
}

/** Every action the audit interceptor records (the Action filter of the audit log screen). */
export enum AuditAction {
  LOGIN = 'LOGIN',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STATUS = 'STATUS',
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  PUBLISH = 'PUBLISH',
  BULK_SAVE = 'BULK_SAVE',
  UPLOAD = 'UPLOAD',
  RESET_PASSWORD = 'RESET_PASSWORD',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  LINK = 'LINK',
  UNLINK = 'UNLINK',
  AI_DRAFT = 'AI_DRAFT',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}
