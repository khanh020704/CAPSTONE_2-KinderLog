import mongoose from 'mongoose'
import { AiProcessingLog, ClassDailySummary, JournalPhoto } from '../../models/index.js'
import { todayISO } from '../../models/helpers.js'
import { SECTION_COLUMNS, SECTION_KEYS, toJournalListItem, toJournalResponse } from '../../dtos/journal.dto.js'
import { recordAudit } from '../../utils/audit.js'
import { BadRequestError, ConflictError, FieldError, ForbiddenError, HttpError, InvalidStateError, NotFoundError } from '../../utils/errors.js'
import { journalAiModel, journalDraftEngine } from '../../config/ai.js'
import { extractJournalEntries } from '../../utils/journal-ai.js'
import { assembleDraft, draftFromTranscript, joinText } from '../../utils/journal-draft.js'
import JournalService from '../journal.service.js'
import { activeParentLinksOf, activeStudentsOf, notifyUsers, requireTeacherClass } from './scope.js'
import settingsService from './settings.service.impl.js'

const DUPLICATE_KEY = 11000

// Where a journal goes back to when it stops being approved.
const unapprovedStatus = (summary) => (summary.inputMethod === 'VOICE' ? 'REVIEW' : 'DRAFT')

const photoUrlsOf = async (summaryId) => (await JournalPhoto.find({ summaryId }).sort({ _id: 1 })).map((photo) => photo.photoUrl)

const respond = async (summary) => toJournalResponse(summary, await photoUrlsOf(summary._id))

const sectionsOf = (summary) => Object.fromEntries(SECTION_KEYS.map((key) => [key, summary[SECTION_COLUMNS[key]] || '']))
const personalOf = (summary) => Object.fromEntries(summary.personalNotes.map((n) => [String(n.studentId), n.content]))

function setContent(summary, sections, personal) {
  for (const key of SECTION_KEYS) summary[SECTION_COLUMNS[key]] = sections[key]
  summary.personalNotes = Object.entries(personal).map(([studentId, content]) => ({ studentId, content }))
}

const hasContent = (summary) => SECTION_KEYS.some((key) => summary[SECTION_COLUMNS[key]]?.trim()) || summary.personalNotes.length > 0

// Every AI call is kept for review; a failure to write the log must not fail the request.
async function recordAiCall(entry) {
  try {
    await AiProcessingLog.create(entry)
  } catch (err) {
    console.error(`Could not write the AI log: ${err.message}`)
  }
}

async function requireAiEnabled() {
  const { aiJournal } = await settingsService.get()
  if (!aiJournal) throw new ForbiddenError('AI-assisted drafts are turned off by the system administrator.', 'AI_DISABLED')
}

// A personal note may only be about an active child of the class.
async function requireStudentsOfClass(classId, personal) {
  const active = new Set((await activeStudentsOf(classId)).map((s) => String(s._id)))
  const strangers = Object.keys(personal).filter((id) => !active.has(id))
  if (strangers.length) {
    throw new BadRequestError(
      'Some personal notes are about children who are not in this class.',
      Object.fromEntries(strangers.map((id) => [`personal.${id}`, 'This student is not in the class.'])),
    )
  }
}

async function requireJournal(user, id) {
  const cls = await requireTeacherClass(user.id)
  const summary = mongoose.isValidObjectId(id) ? await ClassDailySummary.findOne({ _id: id, classId: cls._id }) : null
  if (!summary) throw new NotFoundError('Journal was not found.')
  return { cls, summary }
}

const requireEditable = (summary) => {
  if (summary.status === 'PUBLISHED') throw new InvalidStateError('A published journal can no longer be changed.')
}

class JournalServiceImpl extends JournalService {
  async list(user, { status, date }) {
    const cls = await requireTeacherClass(user.id)
    const filter = { classId: cls._id }
    if (date) filter.summaryDate = date
    // "Needs review" covers journals waiting for approval and those approved but not yet published.
    if (status) filter.status = status === 'review' ? { $in: ['REVIEW', 'APPROVED'] } : status.toUpperCase()
    const summaries = await ClassDailySummary.find(filter).sort({ summaryDate: -1 })
    return { items: summaries.map(toJournalListItem) }
  }

  async get(user, id) {
    const { summary } = await requireJournal(user, id)
    return respond(summary)
  }

  async create(user, { date, source, sections, personal, transcript, audio }) {
    const cls = await requireTeacherClass(user.id)
    if (date > todayISO()) throw new FieldError('date', 'A journal cannot be written for a future date.')
    const voice = source === 'voice'
    if (voice) await requireAiEnabled()
    await requireStudentsOfClass(cls._id, personal)

    const summary = new ClassDailySummary({
      classId: cls._id,
      summaryDate: date,
      createdBy: user.id,
      status: voice ? 'REVIEW' : 'DRAFT',
      inputMethod: voice ? 'VOICE' : 'MANUAL',
      rawTranscript: voice ? transcript : undefined,
      audioUrls: voice ? audio : [],
    })
    setContent(summary, sections, personal)
    try {
      await summary.save()
    } catch (err) {
      if (err.code === DUPLICATE_KEY) throw new ConflictError('This class already has a journal for that day.', 'JOURNAL_EXISTS')
      throw err
    }
    return respond(summary)
  }

  async update(user, id, { sections, personal, photos }) {
    const { cls, summary } = await requireJournal(user, id)
    requireEditable(summary)
    await requireStudentsOfClass(cls._id, personal)
    const { maxPhotos } = await settingsService.get()
    if (photos.length > maxPhotos) throw new FieldError('photos', `A journal can have at most ${maxPhotos} photos.`)

    const currentPhotos = await photoUrlsOf(summary._id)
    const before = JSON.stringify([sectionsOf(summary), personalOf(summary), currentPhotos])
    setContent(summary, sections, personal)
    const changed = JSON.stringify([sectionsOf(summary), personalOf(summary), photos]) !== before

    // Anything changed after approval has to be approved again before it can be published.
    if (changed && summary.status === 'APPROVED') {
      summary.status = unapprovedStatus(summary)
      summary.approvedAt = undefined
    }
    await summary.save()

    if (JSON.stringify(photos) !== JSON.stringify(currentPhotos)) {
      await JournalPhoto.deleteMany({ summaryId: summary._id })
      await JournalPhoto.insertMany(
        photos.map((photoUrl) => ({ summaryId: summary._id, classId: cls._id, photoUrl, uploadedBy: user.id })),
      )
    }
    return respond(summary)
  }

  async approve(user, id) {
    const { summary } = await requireJournal(user, id)
    requireEditable(summary)
    if (!hasContent(summary)) throw new InvalidStateError('Add content to at least one section before approving.')
    if (summary.status !== 'APPROVED') {
      summary.status = 'APPROVED'
      summary.approvedAt = new Date()
      await summary.save()
    }
    return respond(summary)
  }

  async publish(user, id) {
    const { cls, summary } = await requireJournal(user, id)
    if (summary.status !== 'APPROVED') {
      throw new InvalidStateError(
        summary.status === 'PUBLISHED' ? 'This journal is already published.' : 'Approve the journal before publishing it.',
      )
    }
    summary.status = 'PUBLISHED'
    summary.publishedAt = new Date()
    await summary.save()
    await JournalPhoto.updateMany({ summaryId: summary._id }, { isApproved: true })

    const students = await activeStudentsOf(cls._id)
    const links = await activeParentLinksOf(students.map((s) => s._id))
    await notifyUsers(
      links.map((link) => link.parentId),
      {
        type: 'JOURNAL_NEW',
        summaryId: summary._id,
        title: 'New journal published',
        content: `The daily journal for ${cls.className} is ready to view.`,
      },
    )
    // A note about one child is announced to that child's parents only.
    for (const note of summary.personalNotes) {
      const student = students.find((s) => s._id.equals(note.studentId))
      if (!student) continue
      await notifyUsers(
        links.filter((link) => link.studentId.equals(student._id)).map((link) => link.parentId),
        {
          type: 'JOURNAL_NEW',
          summaryId: summary._id,
          studentId: student._id,
          title: `A note about ${student.fullName}`,
          content: "The teacher wrote a personal note in today's journal.",
        },
      )
    }
    await recordAudit({ userId: user.id, action: 'Publish', module: 'Daily Journal', description: `Journal published: ${cls.className}` })
    return respond(summary)
  }

  async addRecording(user, id, { sections, personal, transcript, audioUrl }) {
    await requireAiEnabled()
    const { cls, summary } = await requireJournal(user, id)
    requireEditable(summary)
    await requireStudentsOfClass(cls._id, personal)

    // The new text is added to the draft; nothing the teacher already has is replaced.
    const current = { sections: sectionsOf(summary), personal: personalOf(summary) }
    setContent(
      summary,
      Object.fromEntries(SECTION_KEYS.map((key) => [key, joinText(current.sections[key], sections[key])])),
      { ...current.personal, ...Object.fromEntries(Object.entries(personal).map(([sid, text]) => [sid, joinText(current.personal[sid], text)])) },
    )
    summary.rawTranscript = joinText(summary.rawTranscript, transcript)
    if (audioUrl) summary.audioUrls.push(audioUrl)
    summary.inputMethod = 'VOICE'
    summary.status = 'REVIEW'
    summary.approvedAt = undefined
    await summary.save()
    return respond(summary)
  }

  async voiceDraft(user, { transcript, audioUrl }) {
    await requireAiEnabled()
    const cls = await requireTeacherClass(user.id)
    if (!transcript) {
      // Turning audio into text needs a speech-to-text service, which this server does not have yet.
      if (audioUrl) {
        throw new HttpError(502, 'AI_UNAVAILABLE', "We couldn't process the recording. Speech-to-text is not available on the server yet; send the transcript text with the recording.")
      }
      throw new InvalidStateError("We couldn't process the recording. No speech was detected. Please try again.", 'NO_SPEECH')
    }
    const students = (await activeStudentsOf(cls._id)).map((s) => ({ id: String(s._id), fullName: s.fullName }))
    if (journalDraftEngine() === 'keywords') {
      return { ...draftFromTranscript(transcript, students), entries: [], engine: 'keywords', audioUrl: audioUrl || null }
    }

    // The AI only turns speech into structured entries; the draft is built from them in plain code.
    const started = Date.now()
    const log = { userId: user.id, audioUrl, rawTranscript: transcript, llmModel: journalAiModel() }
    try {
      const entries = await extractJournalEntries(transcript, students)
      await recordAiCall({ ...log, extractedJson: JSON.stringify(entries), processingMs: Date.now() - started })
      return { transcript, ...assembleDraft(entries, students), engine: 'ai', audioUrl: audioUrl || null }
    } catch (err) {
      await recordAiCall({ ...log, processingMs: Date.now() - started, isSuccess: false, errorMessage: String(err.message).slice(0, 1000) })
      throw err
    }
  }
}

export default new JournalServiceImpl()
