import { isDuplicate } from '../../db/errors.js'
import { isId } from '../../db/table.js'
import { UnitOfWork } from '../../db/unit-of-work.js'
import { newSummary } from '../../models/journal.js'
import { todayISO } from '../../models/helpers.js'
import { SECTION_COLUMNS, SECTION_KEYS, toJournalListItem, toJournalResponse, toPublishedContent } from '../../dtos/journal.dto.js'
import { recordAudit } from '../../utils/audit.js'
import { BadRequestError, ConflictError, FieldError, ForbiddenError, HttpError, InvalidStateError, NotFoundError } from '../../utils/errors.js'
import { journalAiModel, journalDraftEngine } from '../../config/ai.js'
import { extractJournalEntries } from '../../utils/journal-ai.js'
import { draftFromTranscript, joinText } from '../../utils/journal-draft.js'
import { joinNew, withoutSentence } from '../../utils/journal-constants.js'
import { publishedChanges } from '../../utils/journal-publish.js'
import { assembleDraft, reviewDraft } from '../../utils/journal-review.js'
import { speechToTextAvailable, transcribe } from '../../utils/speech-to-text.js'
import JournalService from '../journal.service.js'
import { activeParentLinksOf, activeStudentsOf, notifyUsers, requireTeacherClass } from './scope.js'
import settingsService from './settings.service.impl.js'

// Where a journal goes back to when it stops being approved.
const unapprovedStatus = (summary) => (summary.inputMethod === 'VOICE' ? 'REVIEW' : 'DRAFT')

const photoUrlsOf = async (uow, summaryId) => (await uow.journalPhotos.find({ summaryId }, { orderBy: [['id', 'ASC']] })).map((photo) => photo.photoUrl)

const respond = async (uow, summary) => toJournalResponse(summary, await photoUrlsOf(uow, summary.id))

const sectionsOf = (summary) => Object.fromEntries(SECTION_KEYS.map((key) => [key, summary[SECTION_COLUMNS[key]] || '']))
const personalOf = (summary) => Object.fromEntries(summary.personalNotes.map((n) => [String(n.studentId), n.content]))

const issuesOf = (summary) =>
  summary.reviewIssues.map((i) => ({ id: i.issueId, status: i.status, resolution: i.resolution || null, assignedTo: i.assignedTo.map(String) }))

// Ids an issue may point at: active children of the class only.
const keepInClass = (issue, active) => ({
  ...issue,
  candidates: issue.candidates.filter((id) => active.has(String(id))),
  studentIds: issue.studentIds.filter((id) => active.has(String(id))),
  assignedTo: issue.assignedTo.filter((id) => active.has(String(id))),
})

// Applies the teacher's decisions, by issue id. A held statement is assigned to children, kept for the
// whole class, or left out; anything else is confirmed. Decisions about unknown ids are ignored.
function decideIssues(summary, decisions, active) {
  for (const decision of decisions) {
    const issue = summary.reviewIssues.find((i) => i.issueId === decision.id)
    if (!issue) continue
    if (decision.status === 'open') {
      Object.assign(issue, { status: 'open', resolution: undefined, assignedTo: [], resolvedAt: undefined })
      continue
    }
    // A correction that replaced a statement may also be undone: the earlier statement is kept as well.
    const allowed = issue.held ? ['assigned', 'class', 'discarded'] : issue.type === 'correction' && issue.previousText ? ['confirmed', 'reverted'] : ['confirmed']
    if (!allowed.includes(decision.resolution)) {
      throw new FieldError(
        `issues.${decision.id}`,
        issue.held ? 'Choose a child, keep it for the whole class, or leave it out.' : 'Confirm that you have checked this.',
      )
    }
    const assignedTo = decision.assignedTo.filter((id) => active.has(id))
    if (decision.resolution === 'assigned' && !assignedTo.length) throw new FieldError(`issues.${decision.id}`, 'Choose a child of this class.')
    Object.assign(issue, {
      status: 'resolved',
      resolution: decision.resolution,
      assignedTo: decision.resolution === 'assigned' ? assignedTo : [],
      resolvedAt: new Date(),
    })
  }
}

const openIssues = (summary) => summary.reviewIssues.filter((i) => i.status === 'open')

function setContent(summary, sections, personal) {
  for (const key of SECTION_KEYS) summary[SECTION_COLUMNS[key]] = sections[key]
  summary.personalNotes = Object.entries(personal).map(([studentId, content]) => ({ studentId, content }))
}

const hasContent = (summary) => SECTION_KEYS.some((key) => summary[SECTION_COLUMNS[key]]?.trim()) || summary.personalNotes.length > 0

// Every AI call is kept for review, in a unit of work of its own; a failure to write the log must not fail the request.
async function recordAiCall(entry) {
  try {
    await UnitOfWork.run((uow) => uow.aiLogs.insert(entry))
  } catch (err) {
    console.error(`Could not write the AI log: ${err.message}`)
  }
}

async function requireAiEnabled() {
  const { aiJournal } = await settingsService.get()
  if (!aiJournal) throw new ForbiddenError('AI-assisted drafts are turned off by the system administrator.', 'AI_DISABLED')
}

// A personal note may only be about an active child of the class.
async function requireStudentsOfClass(uow, classId, personal) {
  const active = new Set((await activeStudentsOf(uow, classId)).map((s) => s.id))
  const strangers = Object.keys(personal).filter((id) => !active.has(id))
  if (strangers.length) {
    throw new BadRequestError(
      'Some personal notes are about children who are not in this class.',
      Object.fromEntries(strangers.map((id) => [`personal.${id}`, 'This student is not in the class.'])),
    )
  }
}

async function requireJournal(uow, user, id) {
  const cls = await requireTeacherClass(uow, user.id)
  const summary = isId(id) ? await uow.journals.findOne({ id, classId: cls.id }) : null
  if (!summary) throw new NotFoundError('Journal was not found.')
  return { cls, summary }
}

const classStudentsOf = async (uow, classId) =>
  (await activeStudentsOf(uow, classId)).map((s) => ({ id: s.id, fullName: s.fullName, nickname: s.nickname || undefined }))

// Whisper on the server knows the children's names; the browser's text is the fallback.
async function speechToText(students, browserTranscript, audioPath) {
  let asrError
  if (audioPath && speechToTextAvailable()) {
    try {
      const heard = await transcribe(audioPath, students)
      if (heard) return { transcript: heard, transcriptSource: 'whisper' }
    } catch (err) {
      asrError = err.message
      console.error(`[stt] Whisper failed, using the browser transcript: ${err.message}`)
    }
  }
  if (browserTranscript) return { transcript: browserTranscript, transcriptSource: 'browser' }
  if (audioPath && !speechToTextAvailable()) {
    throw new HttpError(502, 'AI_UNAVAILABLE', "We couldn't process the recording. Speech-to-text is not available on the server; send the transcript text with the recording.")
  }
  if (asrError) throw new HttpError(502, 'AI_UNAVAILABLE', "We couldn't process the recording. The speech-to-text service failed. Please try again.")
  throw new InvalidStateError("We couldn't process the recording. No speech was detected. Please try again.", 'NO_SPEECH')
}

// The day's attendance of the children, as reviewDraft takes it: { studentId: { status, note } }.
async function attendanceOf(uow, students, date) {
  if (!students.length) return {}
  const rows = await uow.attendance.find({ studentId: students.map((s) => s.id), attendanceDate: date })
  return Object.fromEntries(rows.map((r) => [r.studentId, { status: r.status.toLowerCase(), note: r.note || '' }]))
}

// The content parents will see once this is published, kept apart from the teacher's working copy.
const versionOf = (summary, photoUrls, publishedAt) => ({
  ...Object.fromEntries(SECTION_KEYS.map((key) => [SECTION_COLUMNS[key], summary[SECTION_COLUMNS[key]] || ''])),
  personalNotes: summary.personalNotes.map((n) => ({ studentId: n.studentId, content: n.content })),
  photoUrls,
  publishedAt,
})

class JournalServiceImpl extends JournalService {
  async list(user, { status, date }) {
    const uow = UnitOfWork.read()
    const cls = await requireTeacherClass(uow, user.id)
    const filter = { classId: cls.id }
    if (date) filter.summaryDate = date
    // "Needs review" covers journals waiting for approval and those approved but not yet published.
    if (status) filter.status = status === 'review' ? { $in: ['REVIEW', 'APPROVED'] } : status.toUpperCase()
    const summaries = await uow.journals.find(filter, { orderBy: [['summaryDate', 'DESC']] })
    return { items: summaries.map(toJournalListItem) }
  }

  async get(user, id) {
    const uow = UnitOfWork.read()
    const { summary } = await requireJournal(uow, user, id)
    return respond(uow, summary)
  }

  async create(user, { date, source, sections, personal, transcript, audio, issues }) {
    if (date > todayISO()) throw new FieldError('date', 'A journal cannot be written for a future date.')
    const voice = source === 'voice'
    if (voice) await requireAiEnabled()
    try {
      return await UnitOfWork.run(async (uow) => {
        const cls = await requireTeacherClass(uow, user.id)
        await requireStudentsOfClass(uow, cls.id, personal)
        const summary = newSummary({
          classId: cls.id,
          summaryDate: date,
          createdBy: user.id,
          status: voice ? 'REVIEW' : 'DRAFT',
          inputMethod: voice ? 'VOICE' : 'MANUAL',
          rawTranscript: voice ? transcript : undefined,
          audioUrls: voice ? audio : [],
        })
        setContent(summary, sections, personal)
        if (voice) {
          const active = new Set((await activeStudentsOf(uow, cls.id)).map((s) => s.id))
          summary.reviewIssues = issues.map((issue) => keepInClass(issue, active))
        }
        return respond(uow, await uow.journals.save(summary))
      })
    } catch (err) {
      if (isDuplicate(err, 'UQ_CDS_Class_Date')) throw new ConflictError('This class already has a journal for that day.', 'JOURNAL_EXISTS')
      throw err
    }
  }

  async update(user, id, { sections, personal, photos, issues }) {
    const { maxPhotos } = await settingsService.get()
    if (photos.length > maxPhotos) throw new FieldError('photos', `A journal can have at most ${maxPhotos} photos.`)

    // The content, the decisions and the photos are saved together, or not at all.
    return UnitOfWork.run(async (uow) => {
      const { cls, summary } = await requireJournal(uow, user, id)
      await requireStudentsOfClass(uow, cls.id, personal)

      const currentPhotos = await photoUrlsOf(uow, summary.id)
      const before = JSON.stringify([sectionsOf(summary), personalOf(summary), currentPhotos, issuesOf(summary)])
      setContent(summary, sections, personal)
      if (issues) decideIssues(summary, issues, new Set((await activeStudentsOf(uow, cls.id)).map((s) => s.id)))
      const changed = JSON.stringify([sectionsOf(summary), personalOf(summary), photos, issuesOf(summary)]) !== before

      // Anything changed after approval has to be approved again before it can be published. A published
      // journal goes back to draft or review the same way; parents keep its published version meanwhile.
      if (changed && ['APPROVED', 'PUBLISHED'].includes(summary.status)) {
        summary.status = unapprovedStatus(summary)
        summary.approvedAt = null
      }
      const saved = await uow.journals.save(summary)

      if (JSON.stringify(photos) !== JSON.stringify(currentPhotos)) {
        await uow.journalPhotos.remove({ summaryId: summary.id })
        for (const photoUrl of photos) await uow.journalPhotos.insert({ summaryId: summary.id, classId: cls.id, photoUrl, uploadedBy: user.id })
      }
      return respond(uow, saved)
    })
  }

  async approve(user, id) {
    return UnitOfWork.run((uow) => this.approveIn(uow, user, id))
  }

  async approveIn(uow, user, id) {
    const { summary } = await requireJournal(uow, user, id)
    if (summary.status === 'PUBLISHED') throw new InvalidStateError('This journal is already published. Change it first, then approve the changes.')
    // Nothing the teacher has not confirmed can reach parents. Checked first: the content may still be waiting in a point.
    const open = openIssues(summary)
    if (open.length) {
      throw new InvalidStateError(
        `${open.length} ${open.length === 1 ? 'point still needs' : 'points still need'} your confirmation before approving.`,
        'REVIEW_PENDING',
      )
    }
    if (!hasContent(summary)) throw new InvalidStateError('Add content to at least one section before approving.')
    if (summary.status === 'APPROVED') return respond(uow, summary)
    summary.status = 'APPROVED'
    summary.approvedAt = new Date()
    return respond(uow, await uow.journals.save(summary))
  }

  async publish(user, id) {
    // The new published version and the approval of its photos are one unit of work. Parents are told
    // once it is committed, so nobody is notified of a publish that did not happen.
    const { cls, summary, previous, response } = await UnitOfWork.run(async (uow) => {
      const { cls, summary } = await requireJournal(uow, user, id)
      if (summary.status !== 'APPROVED') {
        throw new InvalidStateError(summary.status === 'PUBLISHED' ? 'This journal is already published.' : 'Approve the journal before publishing it.')
      }
      const previous = summary.publishedVersion && toPublishedContent(summary.publishedVersion)
      const now = new Date()
      summary.publishedVersion = versionOf(summary, await photoUrlsOf(uow, summary.id), now)
      summary.revision = (summary.revision || 0) + 1
      summary.status = 'PUBLISHED'
      if (!summary.publishedAt) summary.publishedAt = now
      const saved = await uow.journals.save(summary)
      await uow.journalPhotos.update({ summaryId: saved.id }, { isApproved: true })
      return { cls, summary: saved, previous, response: await respond(uow, saved) }
    })

    const uow = UnitOfWork.read()
    const students = await activeStudentsOf(uow, cls.id)
    const links = await activeParentLinksOf(
      uow,
      students.map((s) => s.id),
    )
    const parentsOf = (student) => links.filter((link) => link.studentId === student.id).map((link) => link.parentId)
    const notifyAboutChild = (student, title, content) =>
      notifyUsers(parentsOf(student), { type: 'JOURNAL_NEW', summaryId: summary.id, studentId: student.id, title, content })

    if (previous) {
      // A published change is announced only to the parents it concerns.
      const { classChanged, studentIds } = publishedChanges(previous, toPublishedContent(summary.publishedVersion))
      if (classChanged) {
        await notifyUsers(
          links.map((link) => link.parentId),
          {
            type: 'JOURNAL_NEW',
            summaryId: summary.id,
            title: 'Journal updated',
            content: `The teacher updated the journal of ${summary.summaryDate} for ${cls.className}.`,
          },
        )
      }
      for (const student of students.filter((s) => studentIds.includes(s.id))) {
        await notifyAboutChild(
          student,
          `Note about ${student.fullName} updated`,
          `The teacher changed the personal note in the journal of ${summary.summaryDate}.`,
        )
      }
      await recordAudit({ userId: user.id, action: 'Update', module: 'Daily Journal', description: `Published journal updated: ${cls.className}` })
      return response
    }

    await notifyUsers(
      links.map((link) => link.parentId),
      {
        type: 'JOURNAL_NEW',
        summaryId: summary.id,
        title: 'New journal published',
        content: `The daily journal for ${cls.className} is ready to view.`,
      },
    )
    // A note about one child is announced to that child's parents only.
    for (const note of summary.personalNotes) {
      const student = students.find((s) => s.id === note.studentId)
      if (student) await notifyAboutChild(student, `A note about ${student.fullName}`, "The teacher wrote a personal note in today's journal.")
    }
    await recordAudit({ userId: user.id, action: 'Publish', module: 'Daily Journal', description: `Journal published: ${cls.className}` })
    return response
  }

  async addRecording(user, id, { sections, personal, transcript, audioUrl, issues }) {
    await requireAiEnabled()
    return UnitOfWork.run(async (uow) => {
      const { cls, summary } = await requireJournal(uow, user, id)
      await requireStudentsOfClass(uow, cls.id, personal)

      // The new text is added to the draft. The only statements replaced are those a correction of this recording
      // names (see reviewDraft): each is taken out of the child's note, or the class section, it is in.
      const current = { sections: sectionsOf(summary), personal: personalOf(summary) }
      const known = new Set(summary.reviewIssues.map((i) => i.issueId))
      const added = issues.filter((i) => !known.has(i.issueId))
      for (const fix of added.filter((i) => i.type === 'correction' && i.previousText)) {
        const [childId] = fix.studentIds
        if (childId && current.personal[childId] != null) current.personal[childId] = withoutSentence(current.personal[childId], fix.previousText)
        else if (!childId) current.sections[fix.section] = withoutSentence(current.sections[fix.section], fix.previousText)
      }
      const notes = {
        ...current.personal,
        ...Object.fromEntries(Object.entries(personal).map(([sid, text]) => [sid, joinNew(current.personal[sid], text)])),
      }
      setContent(
        summary,
        Object.fromEntries(SECTION_KEYS.map((key) => [key, joinNew(current.sections[key], sections[key])])),
        // A note left empty by a correction is no note.
        Object.fromEntries(Object.entries(notes).filter(([, text]) => text.trim())),
      )
      summary.rawTranscript = joinText(summary.rawTranscript, transcript)
      if (audioUrl) summary.audioUrls.push(audioUrl)
      const active = new Set((await activeStudentsOf(uow, cls.id)).map((s) => s.id))
      summary.reviewIssues.push(...added.map((i) => keepInClass(i, active)))
      summary.inputMethod = 'VOICE'
      summary.status = 'REVIEW'
      summary.approvedAt = null
      return respond(uow, await uow.journals.save(summary))
    })
  }

  // Step 1 on its own: the recording -> text, which the teacher reads and corrects before the draft is made.
  async transcribe(user, { transcript: browserTranscript, audioUrl, audioPath }) {
    await requireAiEnabled()
    const uow = UnitOfWork.read()
    const cls = await requireTeacherClass(uow, user.id)
    const students = await classStudentsOf(uow, cls.id)
    const { transcript, transcriptSource } = await speechToText(students, browserTranscript, audioPath)
    return { transcript, transcriptSource, audioUrl: audioUrl || null }
  }

  async voiceDraft(user, { transcript: browserTranscript, audioUrl, audioPath, journalId, date, uploadedAudio }) {
    await requireAiEnabled()
    const uow = UnitOfWork.read()
    const cls = await requireTeacherClass(uow, user.id)
    const students = await classStudentsOf(uow, cls.id)

    // A further recording is checked against what the journal already says.
    let existing
    let day = date || todayISO()
    if (journalId) {
      const { summary } = await requireJournal(uow, user, journalId)
      existing = { sections: sectionsOf(summary), personal: personalOf(summary) }
      day = summary.summaryDate
    }
    // ...and every recording against the day's attendance.
    const attendance = await attendanceOf(uow, students, day)

    // 1. Speech to text. Text the teacher has read and corrected (after POST /journals/transcribe) is used as it is.
    const { transcript, transcriptSource } = uploadedAudio
      ? { transcript: browserTranscript, transcriptSource: 'teacher' }
      : await speechToText(students, browserTranscript, audioPath)
    if (!transcript) throw new InvalidStateError("We couldn't process the recording. No speech was detected. Please try again.", 'NO_SPEECH')

    const result = (draft, engine) => ({ transcript, transcriptSource, ...draft, engine, audioUrl: audioUrl || null })

    // 2. Text to structured entries, 3. checked in code, 4. built into the journal.
    if (journalDraftEngine() === 'keywords') {
      const { sections, personal, entries, issues } = draftFromTranscript(transcript, students, existing, attendance)
      return result({ sections, personal, entries, issues }, 'keywords')
    }
    const started = Date.now()
    const log = {
      userId: user.id,
      audioUrl,
      rawTranscript: transcript,
      asrProvider: { whisper: 'groq-whisper', teacher: 'teacher-edited' }[transcriptSource] ?? 'browser',
      llmModel: journalAiModel(),
    }
    try {
      const { entries, reported } = await extractJournalEntries(transcript, students)
      const reviewed = reviewDraft({ entries, students, transcript, reported, existing, attendance })
      await recordAiCall({ ...log, extractedJson: JSON.stringify({ entries, reported }), processingMs: Date.now() - started })
      return result({ ...assembleDraft(reviewed.entries, students), issues: reviewed.issues }, 'ai')
    } catch (err) {
      await recordAiCall({ ...log, processingMs: Date.now() - started, isSuccess: false, errorMessage: String(err.message).slice(0, 1000) })
      throw err
    }
  }
}

export default new JournalServiceImpl()
