// Unit of Work: the only way the services reach the database.
//
// A unit holds one repository per table, all working on the same executor:
//   - UnitOfWork.run(work): a transaction. Everything `work` does through the unit is committed together
//     when it resolves, and rolled back together when it throws.
//       const saved = await UnitOfWork.run(async (uow) => {
//         const journal = await uow.journals.save(draft)
//         await uow.journalPhotos.insert({ summaryId: journal.id, ... })
//         return journal
//       })
//   - UnitOfWork.read(): no transaction, for reads. Writing a journal through it is refused.
//
// Inside a transaction the statements run one after another (no Promise.all): a transaction has one connection.
import { beginTransaction, poolExecutor } from '../config/database.js'
import * as tables from '../models/index.js'
import { journalRepository } from '../models/journal.js'
import { messageRepository, settingsRepository } from '../models/app.js'

// Property of the unit -> table definition.
const REPOSITORIES = {
  users: tables.User,
  schools: tables.School,
  classes: tables.Class,
  students: tables.Student,
  parentLinks: tables.ParentStudentMap,
  attendance: tables.Attendance,
  summaries: tables.ClassDailySummary,
  dailyJournals: tables.DailyJournal,
  feedbacks: tables.Feedback,
  journalPhotos: tables.JournalPhoto,
  notifications: tables.Notification,
  aiLogs: tables.AiProcessingLog,
  auditLogs: tables.AuditLog,
  refreshTokens: tables.RefreshToken,
  resetTokens: tables.PasswordResetToken,
}

export class UnitOfWork {
  constructor(executor) {
    this.executor = executor
    this.cache = new Map()
    for (const [property, definition] of Object.entries(REPOSITORIES)) {
      Object.defineProperty(this, property, { get: () => this.repository(property, () => definition.repository(executor)) })
    }
  }

  repository(name, make) {
    if (!this.cache.has(name)) this.cache.set(name, make())
    return this.cache.get(name)
  }

  // Whole class journals (notes, recordings, review points, published version): see src/models/journal.js.
  get journals() {
    return this.repository('journals', () => journalRepository(this.executor))
  }

  // Messages, with a summary per conversation.
  get messages() {
    return this.repository('messages', () => messageRepository(this.executor))
  }

  get settings() {
    return this.repository('settings', () => settingsRepository(this.executor))
  }

  // The repository of a table definition, e.g. for the generic admin endpoints.
  of(definition) {
    return this.repository(`table:${definition.name}`, () => definition.repository(this.executor))
  }

  static read() {
    return new UnitOfWork(poolExecutor)
  }

  static async run(work) {
    const tx = await beginTransaction()
    try {
      const result = await work(new UnitOfWork(tx))
      await tx.commit()
      return result
    } catch (err) {
      await tx.rollback().catch(() => {})
      throw err
    }
  }
}
