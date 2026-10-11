// Builds a journal draft from what the teacher said (Md/API2.md, section 7). Two ways in:
//   - assembleDraft: from structured entries, which the AI extracts from free speech (journal-ai.js)
//   - draftFromTranscript: a keyword classifier that needs no AI, used when none is configured
// Either way the result is only ever a draft for the teacher to review.

export const SECTION_KEYS = ['meal', 'learning', 'sleep', 'health', 'emotion', 'note']

// Who a statement is about: the whole class, some of it, no child, or children named by the teacher.
export const ENTRY_STATUSES = ['all', 'part', 'nobody', 'named']

/**
 * Turns structured entries into the two layers of a journal, in plain code:
 *   - an entry that lists students becomes a private note for each of those children
 *   - every other entry (all, nobody, or an unnamed part of the class) joins its section, shared with every parent
 * Entries about children who are not in the class are dropped rather than guessed at.
 *
 * @param {{ section: string, status: string, students?: string[], text: string }[]} entries
 * @param {{ id: string }[]} students active students of the class
 * @returns {{ sections: Record<string, string>, personal: Record<string, string>, entries: object[] }}
 */
export function assembleDraft(entries, students) {
  const inClass = new Set(students.map((student) => student.id))
  const sections = Object.fromEntries(SECTION_KEYS.map((key) => [key, '']))
  const personal = {}
  const kept = []

  for (const entry of entries) {
    const text = String(entry.text ?? '').trim()
    if (!text || !SECTION_KEYS.includes(entry.section) || !ENTRY_STATUSES.includes(entry.status)) continue
    const classWide = entry.status === 'all' || entry.status === 'nobody'
    const about = classWide ? [] : [...new Set(entry.students || [])].filter((id) => inClass.has(id))
    // A statement about named children with none of them in the class has nobody to go to.
    if (entry.status === 'named' && !about.length) continue

    if (about.length) for (const id of about) personal[id] = joinText(personal[id], text)
    else sections[entry.section] = joinText(sections[entry.section], text)
    kept.push({ section: entry.section, status: entry.status, students: about, text })
  }
  return { sections, personal, entries: kept }
}

// Checked in this order; a sentence that matches none goes to `note`.
const SECTION_KEYWORDS = {
  sleep: ['ngủ', 'giấc', 'nghỉ trưa'],
  meal: ['ăn', 'bữa', 'cơm', 'cháo', 'súp', 'canh', 'phở', 'sữa', 'uống'],
  health: ['sức khỏe', 'sức khoẻ', 'sốt', 'ho', 'ốm', 'mệt', 'đau', 'sổ mũi', 'thuốc'],
  emotion: ['vui', 'buồn', 'khóc', 'cười', 'hào hứng', 'ngoan', 'hoạt bát', 'thích thú'],
  learning: ['học', 'vẽ', 'hát', 'kể chuyện', 'chơi', 'hoạt động', 'tập', 'đọc', 'múa', 'tô màu', 'đếm', 'xếp hình'],
}

const CHILD_PREFIXES = ['bé', 'bạn', 'con', 'em', 'cháu']

export const joinText = (...parts) => parts.filter((p) => p?.trim()).join(' ')

// Which students a sentence is about: by full name, by the last two words of the name ("Minh An"),
// or by "bé An" when only one child in the class has that given name. "các bạn nam" is not a child called Nam.
function mentionedStudents(text, students) {
  const has = (phrase) => text.includes(` ${phrase} `)
  const hits = new Set()
  const byGivenName = {}
  for (const student of students) {
    const words = student.fullName.normalize('NFC').toLowerCase().split(/\s+/)
    if (has(words.join(' ')) || has(words.slice(-2).join(' '))) hits.add(student.id)
    ;(byGivenName[words[words.length - 1]] ||= []).push(student)
  }
  for (const [given, list] of Object.entries(byGivenName)) {
    if (list.length === 1 && CHILD_PREFIXES.some((p) => has(`${p} ${given}`) && !has(`các ${p} ${given}`))) hits.add(list[0].id)
  }
  return [...hits]
}

/**
 * @param {string} transcript what the teacher said
 * @param {{ id: string, fullName: string }[]} students active students of the class
 * @returns {{ transcript: string, sections: Record<string, string>, personal: Record<string, string> }}
 */
export function draftFromTranscript(transcript, students) {
  const segments = String(transcript)
    .split(/[.!?\n]+/)
    .flatMap((part) => (part.trim().split(/\s+/).length > 14 ? part.split(/,\s*/) : [part]))
    .map((part) => part.trim())
    .filter(Boolean)

  const buckets = Object.fromEntries(SECTION_KEYS.map((key) => [key, []]))
  const personal = {}
  for (const segment of segments) {
    const text = ` ${segment.normalize('NFC').toLowerCase().replace(/[,;:]/g, ' ').replace(/\s+/g, ' ')} `
    const sentence = `${segment[0].toUpperCase()}${segment.slice(1)}.`
    const about = mentionedStudents(text, students)
    if (about.length) {
      for (const id of about) personal[id] = joinText(personal[id], sentence)
      continue
    }
    const has = (keyword) => text.includes(` ${keyword} `)
    const section = Object.keys(SECTION_KEYWORDS).find((key) => SECTION_KEYWORDS[key].some(has)) || 'note'
    buckets[section].push(sentence)
  }

  return {
    transcript: segments.join('. '),
    sections: Object.fromEntries(Object.entries(buckets).map(([key, sentences]) => [key, sentences.join(' ')])),
    personal,
  }
}
