// Initial schema: one collection per model, with its validation rules and indexes.
// Migrations are a record of what was applied, so the schema is written out here
// instead of being read from the models, which keep changing.

// ---------- field types ----------

const str = (maxLength) => ({ bsonType: 'string', ...(maxLength && { maxLength }) })
const oneOf = (...values) => ({ bsonType: 'string', enum: values })
const day = { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } // calendar date, 'YYYY-MM-DD'
const id = { bsonType: 'objectId' }
const bool = { bsonType: 'bool' }
const num = { bsonType: 'number' }
const date = { bsonType: 'date' }

const unique = { unique: true }

// ---------- collections ----------
// `required` lists the fields that must be present; every other field may be missing or null.

const COLLECTIONS = {
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
      lastLoginAt: date,
      createdAt: date,
      updatedAt: date,
    },
    indexes: [
      [{ username: 1 }, unique],
      [{ email: 1 }, { unique: true, sparse: true }],
    ],
  },

  schools: {
    required: ['schoolCode', 'schoolName', 'isActive'],
    fields: {
      schoolCode: str(20),
      schoolName: str(200),
      address: str(300),
      phone: str(15),
      email: str(150),
      principalId: id,
      isActive: bool,
      createdAt: date,
    },
    indexes: [[{ schoolCode: 1 }, unique]],
  },

  classes: {
    required: ['classCode', 'className', 'gradeLevel', 'schoolYear', 'maxCapacity', 'isActive'],
    fields: {
      classCode: str(20),
      className: str(100),
      gradeLevel: str(50),
      schoolYear: str(20),
      teacherId: id,
      roomName: str(50),
      maxCapacity: num,
      isActive: bool,
      createdAt: date,
      updatedAt: date,
    },
    indexes: [[{ classCode: 1, schoolYear: 1 }, unique], [{ teacherId: 1 }]],
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
      enrollmentDate: day,
      isActive: bool,
      createdAt: date,
      updatedAt: date,
    },
    indexes: [[{ studentCode: 1 }, unique], [{ classId: 1 }]],
  },

  parent_student_map: {
    required: ['parentId', 'studentId', 'relationship', 'isPrimary', 'canPickup'],
    fields: {
      parentId: id,
      studentId: id,
      relationship: oneOf('Cha', 'Mẹ', 'Ông', 'Bà', 'Người giám hộ', 'Khác'),
      isPrimary: bool,
      canPickup: bool,
      createdAt: date,
    },
    indexes: [[{ parentId: 1, studentId: 1 }, unique], [{ studentId: 1 }]],
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
    },
    indexes: [[{ studentId: 1, attendanceDate: 1 }, unique], [{ attendanceDate: 1, classId: 1 }]],
  },

  class_daily_summaries: {
    required: ['classId', 'summaryDate'],
    fields: {
      classId: id,
      summaryDate: day,
      generalMeal: str(255),
      generalSleep: str(255),
      generalStudy: str(255),
      generalPlay: str(255),
      generalHealth: str(255),
      generalMood: str(255),
      totalStudents: num,
      presentCount: num,
      absentCount: num,
      createdBy: id,
      createdAt: date,
      updatedAt: date,
    },
    indexes: [[{ classId: 1, summaryDate: 1 }, unique]],
  },

  daily_journals: {
    required: ['studentId', 'classId', 'journalDate', 'status', 'isException'],
    fields: {
      studentId: id,
      classId: id,
      journalDate: day,
      mealDetail: str(500),
      sleepDetail: str(500),
      studyDetail: str(500),
      playDetail: str(500),
      healthDetail: str(500),
      emotionDetail: str(500),
      symptoms: str(500),
      status: oneOf('DRAFT', 'APPROVED', 'REJECTED'),
      isException: bool,
      inputMethod: oneOf('VOICE', 'MANUAL', 'BULK'),
      rawTranscript: str(),
      aiJsonResult: str(),
      createdBy: id,
      approvedBy: id,
      approvedAt: date,
      createdAt: date,
      updatedAt: date,
    },
    indexes: [[{ studentId: 1, journalDate: 1 }, unique], [{ journalDate: 1, classId: 1 }], [{ status: 1 }]],
  },

  journal_photos: {
    required: ['classId', 'photoUrl', 'isApproved'],
    fields: {
      journalId: id,
      summaryId: id,
      classId: id,
      photoUrl: str(500),
      caption: str(255),
      isApproved: bool,
      uploadedBy: id,
      uploadedAt: date,
    },
    // A photo belongs to a student's journal or to a class summary.
    rule: { $or: [{ journalId: { $type: 'objectId' } }, { summaryId: { $type: 'objectId' } }] },
    indexes: [[{ journalId: 1 }], [{ summaryId: 1 }]],
  },

  feedbacks: {
    required: ['journalId', 'parentId', 'isRead'],
    fields: {
      journalId: id,
      parentId: id,
      content: str(1000),
      isRead: bool,
      createdAt: date,
    },
    indexes: [[{ journalId: 1 }], [{ parentId: 1 }]],
  },

  notifications: {
    required: ['userId', 'title', 'type', 'isRead'],
    fields: {
      userId: id,
      studentId: id,
      journalId: id,
      title: str(200),
      content: str(1000),
      type: oneOf('JOURNAL_NEW', 'HEALTH_ALERT', 'SYSTEM', 'FEEDBACK'),
      isRead: bool,
      readAt: date,
      sentAt: date,
    },
    indexes: [[{ userId: 1, isRead: 1 }]],
  },

  ai_processing_logs: {
    required: ['isSuccess'],
    fields: {
      userId: id,
      audioUrl: str(500),
      rawTranscript: str(),
      extractedJson: str(),
      asrProvider: str(50),
      llmModel: str(50),
      processingMs: num,
      isSuccess: bool,
      errorMessage: str(1000),
      createdAt: date,
    },
    indexes: [],
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
      createdAt: date,
    },
    indexes: [[{ createdAt: 1 }]],
  },
}

// ---------- helpers ----------

const nullable = ({ bsonType, enum: values, ...rest }) => ({
  bsonType: [bsonType, 'null'],
  ...(values && { enum: [...values, null] }),
  ...rest,
})

function validatorOf({ required, fields, rule }) {
  const properties = Object.fromEntries(
    Object.entries(fields).map(([name, type]) => [name, required.includes(name) ? type : nullable(type)]),
  )
  const schema = { $jsonSchema: { bsonType: 'object', required, properties } }
  return rule ? { $and: [schema, rule] } : schema
}

const collectionNames = async (db) =>
  new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))

// ---------- migration ----------

export async function up(db) {
  const existing = await collectionNames(db)
  for (const [name, definition] of Object.entries(COLLECTIONS)) {
    const validator = validatorOf(definition)
    if (existing.has(name)) await db.command({ collMod: name, validator, validationLevel: 'strict' })
    else await db.createCollection(name, { validator, validationLevel: 'strict' })
    for (const [keys, options = {}] of definition.indexes) await db.collection(name).createIndex(keys, options)
  }
}

// Drops every collection above together with its data.
export async function down(db) {
  const existing = await collectionNames(db)
  for (const name of Object.keys(COLLECTIONS)) {
    if (existing.has(name)) await db.collection(name).drop()
  }
}
