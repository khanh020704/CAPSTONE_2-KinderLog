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

export const toJournalListItem = (summary) => ({
  id: String(summary._id),
  date: summary.summaryDate,
  status: summary.status.toLowerCase(),
  source: (summary.inputMethod || 'MANUAL').toLowerCase(),
  updatedAt: toMillis(summary.updatedAt),
})

// The teacher's full view, including every personal note, the transcript and the recordings.
export const toJournalResponse = (summary, photoUrls) => ({
  ...toJournalListItem(summary),
  classId: String(summary.classId),
  sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, summary[SECTION_COLUMNS[key]] || ''])),
  personal: Object.fromEntries(summary.personalNotes.map((n) => [String(n.studentId), n.content])),
  photos: photoUrls,
  transcript: summary.rawTranscript || '',
  audio: summary.audioUrls,
  publishedAt: toMillis(summary.publishedAt),
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
  }
  if (dto.audioUrl.length > MAX_URL) fields.audioUrl = 'Send a file address.'
  check(fields)
  return dto
}

// The transcript comes from the browser's speech recognition; `audioUrl` is the uploaded recording, if any.
export function toVoiceDraftDto(body, audioUrl) {
  const fields = {}
  const transcript = readText(body?.transcript, 'transcript', fields)
  check(fields)
  return { transcript, audioUrl }
}
