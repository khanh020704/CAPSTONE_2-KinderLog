// The class journal of Md/API2.md: one per class per day, shared with every parent of the class.
// DRAFT (written by hand) or REVIEW (AI draft) -> APPROVED -> PUBLISHED (visible to parents).
// Editing a published journal sends it back to DRAFT or REVIEW; parents keep the published version meanwhile.
//
// A journal is stored in several tables (migrations 003 and 004). The service works with it as one object
// through the journal repository of a UnitOfWork (uow.journals), which loads and saves it as a whole:
//   { ...the Class_Daily_Summaries row,
//     personalNotes: [{ studentId, content }],          Summary_Personal_Notes
//     audioUrls: [url],                                  Summary_Audio
//     reviewIssues: [{ issueId, type, section, ... }],   Summary_Review_Issues
//     publishedVersion: { generalMeal, ..., personalNotes, photoUrls, publishedAt } | null }   Summary_Published*
import { all, list, run, sql } from '../db/sql.js'
import { defineTable } from '../db/table.js'
import { created, updated } from './helpers.js'

export const SUMMARY_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED']
export const SUMMARY_INPUT_METHODS = ['MANUAL', 'VOICE']
export const REVIEW_ISSUE_TYPES = [
  'unknown_student',
  'ambiguous_student',
  'name_mismatch',
  'missing_student',
  'child_named_in_class_text',
  'contradiction',
  'unclear',
  'health_alert',
  'unsupported_content',
  'attendance_mismatch',
  'correction',
]
export const REVIEW_RESOLUTIONS = ['assigned', 'class', 'discarded', 'confirmed', 'reverted']
const SECTIONS = ['meal', 'learning', 'sleep', 'health', 'emotion', 'note']
// The class sections a published version keeps (GeneralPlay is not used by the class journal).
export const VERSION_COLUMNS = ['generalMeal', 'generalSleep', 'generalStudy', 'generalHealth', 'generalMood', 'generalNote']

const general = { type: 'string', max: 2000 }

export const ClassDailySummary = defineTable({
  name: 'ClassDailySummary',
  table: 'Class_Daily_Summaries',
  key: 'SummaryID',
  fields: {
    classId: { type: 'id', ref: 'Class', required: true },
    summaryDate: { type: 'date', required: true },
    generalMeal: general,
    generalSleep: general,
    generalStudy: general,
    generalPlay: general,
    generalHealth: general,
    generalMood: general,
    generalNote: general,
    status: { type: 'string', enum: SUMMARY_STATUSES, required: true, default: 'DRAFT' },
    inputMethod: { type: 'string', enum: SUMMARY_INPUT_METHODS },
    rawTranscript: { type: 'text' },
    totalStudents: { type: 'int' },
    presentCount: { type: 'int' },
    absentCount: { type: 'int' },
    createdBy: { type: 'id', ref: 'User', column: 'CreatedBy' },
    approvedAt: { type: 'datetime' },
    // The first time the journal was published.
    publishedAt: { type: 'datetime' },
    // How many times it has been published: 1 after the first publish, +1 for every published change.
    revision: { type: 'int', required: true, default: 0 },
    createdAt: created(),
    updatedAt: updated(),
  },
  uniques: { UQ_CDS_Class_Date: ['classId', 'summaryDate'] },
})

const ROW_FIELDS = Object.keys(ClassDailySummary.fields).filter((f) => !['createdAt', 'updatedAt'].includes(f))

const parse = (text) => (text ? JSON.parse(text) : [])
const ids = (values) => (values || []).map(String)
const columnOf = (field) => field.charAt(0).toUpperCase() + field.slice(1)

// A journal not saved yet: defaults for everything not given.
export const newSummary = (values) => ({
  id: null,
  status: 'DRAFT',
  revision: 0,
  personalNotes: [],
  audioUrls: [],
  reviewIssues: [],
  publishedVersion: null,
  ...values,
})

// The journal repository of a UnitOfWork; `executor` is the unit's transaction or the pool.
export function journalRepository(executor) {
  const rows = ClassDailySummary.repository(executor)
  const query = (q) => all(q, executor)
  const exec = (q) => run(q, executor)
  // Writing a journal touches several tables, which only a transaction keeps consistent.
  const requireTransaction = () => {
    if (!executor.transactional) throw new Error('A journal can only be written inside UnitOfWork.run().')
  }

  async function childrenOf(summaryIds) {
    const where = list(summaryIds.map(Number))
    const notes = await query(sql`SELECT SummaryID, StudentID, Content FROM dbo.Summary_Personal_Notes WHERE SummaryID IN ${where} ORDER BY NoteID`)
    const audio = await query(sql`SELECT SummaryID, AudioUrl FROM dbo.Summary_Audio WHERE SummaryID IN ${where} ORDER BY AudioID`)
    const issues = await query(sql`SELECT * FROM dbo.Summary_Review_Issues WHERE SummaryID IN ${where} ORDER BY SortOrder, ReviewIssueID`)
    const published = await query(sql`SELECT * FROM dbo.Summary_Published WHERE SummaryID IN ${where}`)
    const publishedNotes = await query(sql`SELECT SummaryID, StudentID, Content FROM dbo.Summary_Published_Notes WHERE SummaryID IN ${where} ORDER BY StudentID`)
    const publishedPhotos = await query(sql`SELECT SummaryID, PhotoUrl FROM dbo.Summary_Published_Photos WHERE SummaryID IN ${where} ORDER BY SortOrder`)
    const of = (records, summaryId) => records.filter((r) => String(r.SummaryID) === summaryId)
    return (summaryId) => {
      const version = of(published, summaryId)[0]
      return {
        personalNotes: of(notes, summaryId).map((n) => ({ studentId: String(n.StudentID), content: n.Content })),
        audioUrls: of(audio, summaryId).map((a) => a.AudioUrl),
        reviewIssues: of(issues, summaryId).map((i) => ({
          issueId: i.IssueKey,
          type: i.IssueType,
          section: i.Section,
          text: i.Text || '',
          previousText: i.PreviousText || undefined,
          message: i.Message,
          spokenNames: parse(i.SpokenNames),
          candidates: ids(parse(i.Candidates)),
          studentIds: ids(parse(i.StudentIDs)),
          held: Boolean(i.Held),
          status: i.Status,
          resolution: i.Resolution || undefined,
          assignedTo: ids(parse(i.AssignedTo)),
          resolvedAt: i.ResolvedAt || undefined,
        })),
        publishedVersion: version
          ? {
              ...Object.fromEntries(VERSION_COLUMNS.map((f) => [f, version[columnOf(f)] ?? ''])),
              personalNotes: of(publishedNotes, summaryId).map((n) => ({ studentId: String(n.StudentID), content: n.Content })),
              photoUrls: of(publishedPhotos, summaryId).map((p) => p.PhotoUrl),
              publishedAt: version.PublishedAt,
            }
          : null,
      }
    }
  }

  const repo = {
    // Rows of Class_Daily_Summaries -> whole journals.
    async load(summaryRows) {
      if (!summaryRows.length) return []
      const children = await childrenOf(summaryRows.map((r) => r.id))
      return summaryRows.map((row) => ({ ...row, ...children(row.id) }))
    },

    async loadOne(row) {
      return row ? (await repo.load([row]))[0] : null
    },

    // Rows only (no notes, issues...): enough for lists and counts.
    find: (filter, options) => rows.find(filter, options),
    findRow: (filter, options) => rows.findOne(filter, options),
    count: (filter) => rows.count(filter),

    async findOne(filter) {
      return repo.loadOne(await rows.findOne(filter))
    },

    // Writes the journal and everything it holds; resolves to the journal as stored.
    // The child tables are written as a whole: what the object holds is what the database holds afterwards.
    async save(summary) {
      requireTransaction()
      const fields = Object.fromEntries(ROW_FIELDS.map((f) => [f, summary[f] ?? null]))
      const row = summary.id ? (await rows.update({ id: summary.id }, fields))[0] : await rows.insert(fields)
      const id = Number(row.id)

      await exec(sql`DELETE FROM dbo.Summary_Personal_Notes WHERE SummaryID = ${id}`)
      for (const note of summary.personalNotes) {
        await exec(sql`INSERT dbo.Summary_Personal_Notes (SummaryID, StudentID, Content) VALUES (${id}, ${Number(note.studentId)}, ${note.content})`)
      }
      await exec(sql`DELETE FROM dbo.Summary_Audio WHERE SummaryID = ${id}`)
      for (const url of summary.audioUrls) {
        await exec(sql`INSERT dbo.Summary_Audio (SummaryID, AudioUrl, CreatedAt) VALUES (${id}, ${url}, ${new Date()})`)
      }
      await exec(sql`DELETE FROM dbo.Summary_Review_Issues WHERE SummaryID = ${id}`)
      for (const [order, i] of summary.reviewIssues.entries()) {
        if (!SECTIONS.includes(i.section)) continue
        await exec(sql`
          INSERT dbo.Summary_Review_Issues
            (SummaryID, IssueKey, IssueType, Section, Text, PreviousText, Message, SpokenNames, Candidates, StudentIDs, Held, Status, Resolution, AssignedTo, ResolvedAt, SortOrder)
          VALUES (${id}, ${i.issueId}, ${i.type}, ${i.section}, ${i.text || null}, ${i.previousText || null}, ${i.message}, ${JSON.stringify(i.spokenNames || [])},
            ${JSON.stringify(ids(i.candidates).map(Number))}, ${JSON.stringify(ids(i.studentIds).map(Number))}, ${!!i.held}, ${i.status || 'open'},
            ${i.resolution || null}, ${JSON.stringify(ids(i.assignedTo).map(Number))}, ${i.resolvedAt || null}, ${order})`)
      }

      const version = summary.publishedVersion
      if (version) {
        await exec(sql`DELETE FROM dbo.Summary_Published WHERE SummaryID = ${id}`)
        await exec(sql`
          INSERT dbo.Summary_Published (SummaryID, GeneralMeal, GeneralSleep, GeneralStudy, GeneralHealth, GeneralMood, GeneralNote, PublishedAt)
          VALUES (${id}, ${version.generalMeal ?? null}, ${version.generalSleep ?? null}, ${version.generalStudy ?? null},
            ${version.generalHealth ?? null}, ${version.generalMood ?? null}, ${version.generalNote ?? null}, ${version.publishedAt})`)
        for (const note of version.personalNotes) {
          await exec(sql`INSERT dbo.Summary_Published_Notes (SummaryID, StudentID, Content) VALUES (${id}, ${Number(note.studentId)}, ${note.content})`)
        }
        for (const [order, url] of version.photoUrls.entries()) {
          await exec(sql`INSERT dbo.Summary_Published_Photos (SummaryID, PhotoUrl, SortOrder) VALUES (${id}, ${url}, ${order + 1})`)
        }
      }
      return repo.loadOne(row)
    },

    // Removes a journal with its notes, recordings, points, published version and photos.
    // Notifications about it stay, without the link to it. False when it does not exist.
    async remove(id) {
      requireTransaction()
      if (!(await rows.findById(id))) return false
      await exec(sql`UPDATE dbo.Notifications SET SummaryID = NULL WHERE SummaryID = ${Number(id)}`)
      await exec(sql`DELETE FROM dbo.Journal_Photos WHERE SummaryID = ${Number(id)}`)
      return (await exec(sql`DELETE FROM dbo.Class_Daily_Summaries WHERE SummaryID = ${Number(id)}`)) > 0
    },
  }
  return repo
}
