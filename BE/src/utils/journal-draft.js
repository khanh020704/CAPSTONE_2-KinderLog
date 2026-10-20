// The keyword engine: turns what the teacher said into journal entries without any AI
// (Md/API2.md, section 7). It is used when no AI provider is configured. Its entries go
// through the same checks as the AI's (journal-review.js), so a name it cannot verify is
// held for the teacher instead of being guessed.

import { ENTRY_STATUSES, SECTION_KEYS, SECTION_KEYWORDS, joinText } from './journal-constants.js'
import { assembleDraft, reviewDraft } from './journal-review.js'
import { CHILD_PREFIXES, findSpokenNames, matchStudentName, normalize } from './vietnamese-names.js'

export { ENTRY_STATUSES, SECTION_KEYS, joinText, assembleDraft }

// Speech recognition rarely adds punctuation, so a report is also cut where a new subject or
// topic starts: before a child's name, "cả lớp", "các con", "rồi", "còn", "nhắn", "trừ"...
const BREAKS = ['cả lớp', 'các con', 'rồi', 'còn', 'sau đó', 'buổi sáng', 'buổi trưa', 'buổi chiều', 'nhắn', 'nhờ', 'trừ', 'riêng', 'không bạn nào', 'không bé nào', 'không con nào']

function cut(sentence, students) {
  const words = sentence.split(/\s+/).filter(Boolean)
  const lower = words.map((w) => normalize(w))
  const starts = new Set([0])
  for (let i = 1; i < words.length; i++) {
    const two = `${lower[i]} ${lower[i + 1] ?? ''}`
    const three = `${two} ${lower[i + 2] ?? ''}`
    if (BREAKS.includes(lower[i]) || BREAKS.includes(two) || BREAKS.includes(three)) starts.add(i)
    // "bé An", "bạn Ngọc": a child's name starts a new statement, unless it continues "các bạn".
    if (CHILD_PREFIXES.includes(lower[i]) && lower[i - 1] !== 'các' && findSpokenNames(`${words[i]} ${words[i + 1] ?? ''}`, students).length) starts.add(i)
  }
  const points = [...starts].sort((a, b) => a - b)
  const parts = points.map((start, k) => words.slice(start, points[k + 1]))
  // A piece of one or two words ("Hôm nay", "rồi") is not a statement: it joins the next one.
  const merged = []
  for (let k = 0; k < parts.length; k++) {
    if (parts[k].length < 3 && k + 1 < parts.length) parts[k + 1] = [...parts[k], ...parts[k + 1]]
    else if (parts[k].length < 3 && merged.length) merged[merged.length - 1].push(...parts[k])
    else merged.push(parts[k])
  }
  return merged.map((part) => part.join(' '))
}

const capitalise = (text) => `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`

/**
 * @param {string} transcript what the teacher said
 * @param {{ id: string, fullName: string, nickname?: string }[]} students active students of the class
 * @returns {{ transcript: string, entries: { section, status, text, mentions }[] }}
 */
export function keywordEntries(transcript, students) {
  const sentences = String(transcript)
    .split(/[.!?\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const parts = sentences.flatMap((sentence) => cut(sentence, students))

  const entries = parts.map((part) => {
    const text = ` ${normalize(part)} `
    const has = (keyword) => text.includes(` ${keyword} `)
    const section = (has('nhắn') || has('nhờ') ? 'note' : null) || Object.keys(SECTION_KEYWORDS).find((key) => SECTION_KEYWORDS[key].some(has)) || 'note'
    const mentions = findSpokenNames(part, students).map((spoken) => {
      const match = matchStudentName(spoken, students)
      return { spoken, studentId: match.studentId }
    })
    const status = mentions.length ? 'named' : /(^| )không (bạn|bé|con|ai) nào /.test(text) ? 'nobody' : has('cả lớp') || has('các con') ? 'all' : 'part'
    return { section, status, text: capitalise(part), mentions }
  })
  return { transcript: sentences.join('. '), entries }
}

/**
 * The whole keyword path: entries, checks, then the journal layers.
 * @returns {{ transcript: string, sections: object, personal: object, entries: object[], issues: object[] }}
 */
export function draftFromTranscript(transcript, students, existing, attendance) {
  const { transcript: cleaned, entries } = keywordEntries(transcript, students)
  const reviewed = reviewDraft({ entries, students, transcript, existing, attendance })
  return { transcript: cleaned, ...assembleDraft(reviewed.entries, students), issues: reviewed.issues }
}
