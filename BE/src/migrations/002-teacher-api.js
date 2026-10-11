// What the teacher API (Md/API2.md) needs on top of the initial schema:
//   - class journals: status, source, note for all parents, personal notes, recordings
//   - messages between a teacher and a parent
//   - platform settings, refresh tokens, password reset tokens
//   - sign-in by phone number, locked accounts, active/inactive parent links
// A changed collection gets its complete rule set again, because MongoDB replaces rules as a whole.
import { any, applyCollection, bool, collectionNames, date, day, id, listOf, num, objectOf, oneOf, str, unique } from './lib/schema.js'

const expires = { expireAfterSeconds: 0 }

const CHANGED = {
  users: {
    required: ['username', 'passwordHash', 'fullName', 'role', 'isActive'],
    fields: {
      username: str(50),
      passwordHash: str(255),
      fullName: str(100),
      email: str(150),
      phoneNumber: str(15),
      role: oneOf('ADMIN', 'TEACHER', 'PARENT'),
      avatarUrl: str(500),
      isActive: bool,
      isLocked: bool,
      lastLoginAt: date,
      createdAt: date,
      updatedAt: date,
    },
    indexes: [[{ phoneNumber: 1 }, { unique: true, sparse: true }]],
  },

  students: {
    required: ['studentCode', 'fullName', 'dateOfBirth', 'gender', 'enrollmentDate', 'isActive'],
    fields: {
      studentCode: str(20),
      fullName: str(100),
      nickname: str(50),
      dateOfBirth: day,
      gender: oneOf('Male', 'Female', 'Other'),
      classId: id,
      allergyHistory: str(500),
      healthNote: str(500),
      photoUrl: str(500),
      enrollmentDate: day,
      isActive: bool,
      createdAt: date,
      updatedAt: date,
    },
  },

  parent_student_map: {
    required: ['parentId', 'studentId', 'relationship', 'isPrimary', 'canPickup'],
    fields: {
      parentId: id,
      studentId: id,
      relationship: oneOf('Cha', 'Mẹ', 'Ông', 'Bà', 'Người giám hộ', 'Khác'),
      isPrimary: bool,
      canPickup: bool,
      isActive: bool,
      createdAt: date,
    },
  },

  attendance: {
    required: ['studentId', 'classId', 'attendanceDate', 'status'],
    fields: {
      studentId: id,
      classId: id,
      attendanceDate: day,
      status: oneOf('Present', 'Absent', 'Late', 'Excused'),
      note: str(255),
      recordedBy: id,
      createdAt: date,
      updatedAt: date,
    },
  },

  class_daily_summaries: {
    required: ['classId', 'summaryDate', 'status'],
    fields: {
      classId: id,
      summaryDate: day,
      generalMeal: str(2000),
      generalSleep: str(2000),
      generalStudy: str(2000),
      generalPlay: str(2000),
      generalHealth: str(2000),
      generalMood: str(2000),
      generalNote: str(2000),
      personalNotes: listOf(objectOf(['studentId', 'content'], { studentId: id, content: str(2000) })),
      status: oneOf('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED'),
      inputMethod: oneOf('MANUAL', 'VOICE'),
      rawTranscript: str(),
      audioUrls: listOf(str(500)),
      totalStudents: num,
      presentCount: num,
      absentCount: num,
      createdBy: id,
      approvedAt: date,
      publishedAt: date,
      createdAt: date,
      updatedAt: date,
    },
    indexes: [[{ classId: 1, status: 1 }]],
  },

  notifications: {
    required: ['userId', 'title', 'type', 'isRead'],
    fields: {
      userId: id,
      studentId: id,
      journalId: id,
      summaryId: id,
      title: str(200),
      content: str(1000),
      type: oneOf('JOURNAL_NEW', 'HEALTH_ALERT', 'SYSTEM', 'FEEDBACK', 'MESSAGE', 'ANNOUNCEMENT'),
      isRead: bool,
      readAt: date,
      sentAt: date,
    },
  },

  audit_logs: {
    required: ['action'],
    fields: {
      userId: id,
      action: str(100),
      entityName: str(50),
      entityId: str(50),
      description: str(1000),
      ipAddress: str(45),
      status: oneOf('Success', 'Failed'),
      createdAt: date,
    },
  },
}

const ADDED = {
  messages: {
    required: ['parentId', 'teacherId', 'senderRole', 'content', 'isRead'],
    fields: {
      parentId: id,
      teacherId: id,
      senderRole: oneOf('PARENT', 'TEACHER'),
      content: str(2000),
      isRead: bool,
      readAt: date,
      sentAt: date,
    },
    indexes: [[{ parentId: 1, teacherId: 1, sentAt: 1 }], [{ teacherId: 1, isRead: 1 }], [{ parentId: 1, isRead: 1 }]],
  },

  system_settings: {
    required: ['key', 'value'],
    fields: { key: str(50), value: any, updatedAt: date },
    indexes: [[{ key: 1 }, unique]],
  },

  refresh_tokens: {
    required: ['userId', 'tokenHash', 'expiresAt'],
    fields: { userId: id, tokenHash: str(128), expiresAt: date, revokedAt: date, createdAt: date },
    indexes: [[{ tokenHash: 1 }, unique], [{ userId: 1 }], [{ expiresAt: 1 }, expires]],
  },

  password_reset_tokens: {
    required: ['userId', 'tokenHash', 'expiresAt'],
    fields: { userId: id, tokenHash: str(128), expiresAt: date, usedAt: date, createdAt: date },
    indexes: [[{ tokenHash: 1 }, unique], [{ expiresAt: 1 }, expires]],
  },
}

const DEFAULT_SETTINGS = {
  platformName: 'KinderLog',
  supportEmail: 'hotro@kinderlog.vn',
  sessionTimeout: 60,
  passwordMin: 6,
  aiJournal: true,
  sttLanguage: 'Vietnamese',
  maxPhotos: 6,
}

export async function up(db) {
  const existing = await collectionNames(db)
  for (const [name, definition] of Object.entries({ ...CHANGED, ...ADDED })) {
    await applyCollection(db, existing, name, definition)
  }

  // Rows written before this migration get the new required-by-the-app fields.
  await db.collection('class_daily_summaries').updateMany({ status: { $exists: false } }, { $set: { status: 'DRAFT' } })
  await db.collection('users').updateMany({ isLocked: { $exists: false } }, { $set: { isLocked: false } })
  await db.collection('parent_student_map').updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } })

  const updatedAt = new Date()
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.collection('system_settings').updateOne({ key }, { $setOnInsert: { key, value, updatedAt } }, { upsert: true })
  }
}

// Removes the added collections and indexes. The changed collections keep their wider rules:
// those still accept everything the initial schema accepted.
export async function down(db) {
  const existing = await collectionNames(db)
  for (const name of Object.keys(ADDED)) {
    if (existing.has(name)) await db.collection(name).drop()
  }
  await db.collection('users').dropIndex('phoneNumber_1').catch(() => {})
  await db.collection('class_daily_summaries').dropIndex('classId_1_status_1').catch(() => {})
}
