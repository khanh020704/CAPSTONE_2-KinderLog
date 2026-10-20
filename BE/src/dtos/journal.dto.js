import { isId } from '../db/table.js'
import { BadRequestError, FieldError } from '../utils/errors.js'
import { isDateOnly, isPlainObject, toMillis } from '../utils/text.js'

// API section -> column of the class summary.
export const SECTION_COLUMNS = {
  meal: 'generalMeal',
  learning: 'generalStudy',
  sleep: 'generalSleep',
  health: 'generalHealth',
  emotion: 'generalMood',
  note: 'generalNote',
}
export const SECTION_KEYS = Object.keys(SECTION_COLUMNS)

const MAX_TEXT = 2000
const MAX_URL = 500
const SOURCES = ['manual', 'voice']
const LIST_STATUSES = ['draft', 'review', 'published']

// ---------- responses ----------

const sectionsOf = (doc) => Object.fromEntries(SECTION_KEYS.map((key) => [key, doc[SECTION_COLUMNS[key]] || '']))
const personalOf = (doc) => Object.fromEntries((doc.personalNotes || []).map((n) => [String(n.studentId), n.content]))

// The version parents see, in the API shape: { sections, personal, photos }.
export const toPublishedContent = (version) => ({ sections: sectionsOf(version), personal: personalOf(version), photos: [...version.photoUrls] })

// When a change to the journal was last published; null while parents still see the first version.
export const editedAtOf = (summary) => (summary.revision > 1 ? toMillis(summary.publishedVersion?.publishedAt) : null)

export const toJournalListItem = (summary) => ({
  id: String(summary.id),
  date: summary.summaryDate,
  status: summary.status.toLowerCase(),
  source: (summary.inputMethod || 'MANUAL').toLowerCase(),
  updatedAt: toMillis(summary.updatedAt),
  publishedAt: toMillis(summary.publishedAt),
  // Published before, edited since: parents still see the published version.
  unpublishedChanges: (summary.revision || 0) > 0 && summary.status !== 'PUBLISHED',
})

// A point of the draft the teacher must confirm (see utils/journal-review.js).
export const toIssueResponse = (issue) => ({
  id: issue.issueId ?? issue.id,
  type: issue.type,
  section: issue.section,
  text: issue.text || '',
  // a correction: the statement it replaced
  previousText: issue.previousText || null,
  message: issue.message,
  spokenNames: [...(issue.spokenNames || [])],
  candidates: (issue.candidates || []).map(String),
  studentIds: (issue.studentIds || []).map(String),
  held: !!issue.held,
  status: issue.status,
  resolution: issue.resolution || null,
  assignedTo: (issue.assignedTo || []).map(String),
})

// The teacher's full view, including every personal note, the transcript and the recordings.
export const toJournalResponse = (summary, photoUrls) => ({
  ...toJournalListItem(summary),
  classId: String(summary.classId),
  sections: sectionsOf(summary),
  personal: personalOf(summary),
  photos: photoUrls,
  transcript: summary.rawTranscript || '',
  audio: summary.audioUrls,
  issues: (summary.reviewIssues || []).map(toIssueResponse),
  revision: summary.revision || 0,
  editedAt: editedAtOf(summary),
})

// ---------- requests ----------

// Missing sections become '', so a journal always has all six.
function readSections(value, fields) {
  if (value !== undefined && !isPlainObject(value)) fields.sections = 'Sections must be an object.'
  const sections = {}
  for (const key of SECTION_KEYS) {
    const text = value?.[key] ?? ''
    if (typeof text !== 'string') fields[`sections.${key}`] = 'Enter text.'
    else if (text.length > MAX_TEXT) fields[`sections.${key}`] = `Keep this section under ${MAX_TEXT} characters.`
    else sections[key] = text.trim()
  }
  return sections
}

// Notes that are empty after trimming are dropped.
function readPersonal(value, fields) {
  if (value !== undefined && !isPlainObject(value)) fields.personal = 'Personal notes must be an object keyed by student id.'
  const personal = {}
  for (const [studentId, text] of Object.entries(isPlainObject(value) ? value : {})) {
    if (typeof text !== 'string') fields[`personal.${studentId}`] = 'Enter text.'
    else if (text.length > MAX_TEXT) fields[`personal.${studentId}`] = `Keep this note under ${MAX_TEXT} characters.`
    else if (text.trim()) personal[studentId] = text.trim()
  }
  return personal
}

function readUrls(value, name, fields) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((url) => typeof url !== 'string' || !url || url.length > MAX_URL)) {
    fields[name] = 'Send a list of file addresses.'
    return []
  }
  return value
}

// null is accepted as "not given": a voice draft without a recording has audioUrl: null.
const readText = (value, name, fields) => {
  if (value != null && typeof value !== 'string') fields[name] = 'Enter text.'
  return typeof value === 'string' ? value.trim() : ''
}

const ISSUE_TYPES = ['unknown_student', 'ambiguous_student', 'name_mismatch', 'missing_student', 'child_named_in_class_text', 'contradiction', 'unclear', 'health_alert', 'unsupported_content', 'attendance_mismatch', 'correction']
const RESOLUTIONS = ['assigned', 'class', 'discarded', 'confirmed', 'reverted']
const ISSUE_ID = /^iss_[0-9a-f]{6,32}$/
const ids = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string' && isId(id)) : [])
const shortText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// Issues as POST /journals/voice-draft returned them, sent back when the draft is saved.
function readIssues(value, fields) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    fields.issues = 'Issues must be a list.'
    return []
  }
  const issues = []
  value.forEach((issue, index) => {
    if (!issue || typeof issue.id !== 'string' || !ISSUE_ID.test(issue.id) || !ISSUE_TYPES.includes(issue.type) || !SECTION_KEYS.includes(issue.section) || typeof issue.message !== 'string') {
      fields[`issues.${index}`] = 'Send the issues as the voice draft returned them.'
      return
    }
    issues.push({
      issueId: issue.id,
      type: issue.type,
      section: issue.section,
      text: shortText(issue.text, 2000),
      previousText: issue.type === 'correction' ? shortText(issue.previousText, 2000) || undefined : undefined,
      message: shortText(issue.message, 500),
      spokenNames: Array.isArray(issue.spokenNames) ? issue.spokenNames.filter((n) => typeof n === 'string').map((n) => n.slice(0, 200)) : [],
      candidates: ids(issue.candidates),
      studentIds: ids(issue.studentIds),
      held: issue.held === true,
      status: issue.status === 'resolved' ? 'resolved' : 'open',
      resolution: RESOLUTIONS.includes(issue.resolution) ? issue.resolution : undefined,
      assignedTo: ids(issue.assignedTo),
    })
  })
  return issues
}

// The teacher's decisions on issues: [{ id, status, resolution, assignedTo }].
function readIssueDecisions(value, fields) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    fields.issues = 'Issues must be a list.'
    return undefined
  }
  return value
    .filter((d, index) => {
      const ok = d && typeof d.id === 'string' && ['open', 'resolved'].includes(d.status) && (d.resolution == null || RESOLUTIONS.includes(d.resolution))
      if (!ok) fields[`issues.${index}`] = 'Send { id, status, resolution, assignedTo } for each issue.'
      return ok
    })
    .map((d) => ({ id: d.id, status: d.status, resolution: d.status === 'resolved' ? d.resolution ?? null : null, assignedTo: ids(d.assignedTo) }))
}

const check = (fields) => {
  if (Object.keys(fields).length) throw new BadRequestError('Some fields are invalid.', fields)
}

export function toJournalListQueryDto(query) {
  const { status, date } = query ?? {}
  if (status !== undefined && !LIST_STATUSES.includes(status)) throw new FieldError('status', 'Use draft, review or published.')
  if (date !== undefined && !isDateOnly(date)) throw new FieldError('date', 'Use the date format YYYY-MM-DD.')
  return { status, date }
}

// A voice journal arrives with the draft made by POST /journals/voice-draft.
export function toCreateJournalDto(body) {
  const b = body ?? {}
  const fields = {}
  if (!isDateOnly(b.date)) fields.date = 'Use the date format YYYY-MM-DD.'
  const source = b.source ?? 'manual'
  if (!SOURCES.includes(source)) fields.source = 'Use manual or voice.'
  const dto = { date: b.date, source, sections: readSections(b.sections, fields), personal: readPersonal(b.personal, fields) }
  dto.transcript = readText(b.transcript, 'transcript', fields)
  dto.audio = readUrls(b.audio, 'audio', fields)
  dto.issues = readIssues(b.issues, fields)
  check(fields)
  return dto
}

// Replaces the sections, the personal notes and the photos as a whole.
export function toUpdateJournalDto(body) {
  const b = body ?? {}
  const fields = {}
  const dto = {
    sections: readSections(b.sections, fields),
    personal: readPersonal(b.personal, fields),
    photos: readUrls(b.photos, 'photos', fields),
    issues: readIssueDecisions(b.issues, fields),
  }
  check(fields)
  return dto
}

// One more recording: same shape as the result of POST /journals/voice-draft.
export function toRecordingDto(body) {
  const b = body ?? {}
  const fields = {}
  const dto = {
    sections: readSections(b.sections, fields),
    personal: readPersonal(b.personal, fields),
    transcript: readText(b.transcript, 'transcript', fields),
    audioUrl: readText(b.audioUrl, 'audioUrl', fields),
    issues: readIssues(b.issues, fields),
  }
  if (dto.audioUrl.length > MAX_URL) fields.audioUrl = 'Send a file address.'
  check(fields)
  return dto
}

// The transcript comes from the browser's speech recognition; `audioUrl` is the uploaded recording, if any.
// `journalId` (optional) is the journal a further recording is for, so it can be checked against what is already written.
// A recording uploaded before by POST /journals/transcribe, as that answer gave it: /uploads/<32 hex>.<audio type>.
const UPLOADED_AUDIO = /\/uploads\/[0-9a-f]{32}\.(webm|ogg|mp3|m4a|wav)$/

export function toVoiceDraftDto(body, file, audioUrl) {
  const fields = {}
  const transcript = readText(body?.transcript, 'transcript', fields)
  // With no file, the recording may be one already uploaded; the text is then the teacher's corrected version.
  const uploaded = !file && typeof body?.audioUrl === 'string' && body.audioUrl ? body.audioUrl : null
  if (uploaded && (uploaded.length > MAX_URL || !UPLOADED_AUDIO.test(uploaded))) fields.audioUrl = 'Send the audioUrl returned by POST /journals/transcribe.'
  const journalId = body?.journalId
  if (journalId !== undefined && journalId !== '' && !isId(journalId)) fields.journalId = 'Send the id of a journal.'
  // The day the journal is for, so what is said can be checked against that day's attendance.
  const date = body?.date
  if (date !== undefined && date !== '' && !isDateOnly(date)) fields.date = 'Use the date format YYYY-MM-DD.'
  check(fields)
  return { transcript, audioUrl: audioUrl ?? uploaded ?? undefined, audioPath: file?.path, journalId: journalId || undefined, date: date || undefined, uploadedAudio: !!uploaded }
}

// POST /journals/transcribe: the recording (required) and, optionally, the browser's transcript as a fallback.
export function toTranscribeDto(body, file, audioUrl) {
  if (!file) throw new FieldError('audio', 'Send the recording as the audio file.')
  const fields = {}
  const transcript = readText(body?.transcript, 'transcript', fields)
  check(fields)
  return { transcript, audioUrl, audioPath: file.path }
}
