// Matching a name the teacher said against the class list, in plain code.
//
// The rule is never to guess: a name counts as a child only when it is written exactly
// like that child's name. Anything close but different (a missing tone mark, one wrong
// letter, a different surname) is reported with the likely children, so the teacher
// decides. Vietnamese names end with the given name, and that is what teachers say:
// "Hoàng Đức Minh" is "Minh", while the middle name of "Nguyễn Minh An" never is.

// Words that come before a child's name in speech: "bé An", "bạn Ngọc".
export const CHILD_PREFIXES = ['bé', 'bạn', 'con', 'em', 'cháu']

export const normalize = (text) =>
  String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Without tone marks: "Ngọc" -> "ngoc", "Đức" -> "duc".
export const toneless = (text) =>
  normalize(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')

export function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[b.length]
}

// "bé Trần Bảo Ngoc" -> ["trần", "bảo", "ngoc"]
function nameWords(spoken) {
  const words = normalize(spoken).split(' ').filter(Boolean)
  while (words.length > 1 && (CHILD_PREFIXES.includes(words[0]) || words[0] === 'các')) words.shift()
  return words
}

const wordsOf = (student) => normalize(student.fullName).split(' ')
const lastWords = (student, count) => wordsOf(student).slice(-count).join(' ')

/**
 * @param {string} spoken the name as the teacher said it, e.g. "bé Ngọc", "Trần Bảo Ngoc"
 * @param {{ id: string, fullName: string, nickname?: string }[]} students active students of the class
 * @returns {{ match: 'exact', studentId: string }
 *         | { match: 'ambiguous' | 'mismatch' | 'unknown', studentId: null, candidates: string[], reason: string }}
 */
export function matchStudentName(spoken, students) {
  const words = nameWords(spoken)
  if (!words.length) return { match: 'unknown', studentId: null, candidates: [], reason: 'No name was given.' }
  const said = words.join(' ')

  // Written exactly like the end of a child's name (full name, last two words, given name) or like a nickname.
  const exact = students.filter(
    (s) => (words.length <= wordsOf(s).length && lastWords(s, words.length) === said) || (s.nickname && normalize(s.nickname) === said),
  )
  if (exact.length === 1) return { match: 'exact', studentId: exact[0].id }
  if (exact.length > 1) {
    return { match: 'ambiguous', studentId: null, candidates: exact.map((s) => s.id), reason: `More than one child in the class is called "${spoken}".` }
  }

  // The given name (or the last words) is exact but the rest is not: "Lê Bảo Ngọc" for "Trần Bảo Ngọc".
  for (let keep = words.length - 1; keep >= 1; keep--) {
    const tail = words.slice(-keep).join(' ')
    const partial = students.filter((s) => keep <= wordsOf(s).length && lastWords(s, keep) === tail)
    if (partial.length) {
      return { match: 'mismatch', studentId: null, candidates: partial.map((s) => s.id), reason: `"${spoken}" does not match the full name of any child.` }
    }
  }

  // Close but not equal: a missing or wrong tone mark ("Ngoc"), or one letter off ("Lin" for "Linh").
  const near = students.filter((s) => {
    if (words.length > wordsOf(s).length) return false
    const theirs = lastWords(s, words.length)
    const a = toneless(said)
    const b = toneless(theirs)
    // Another first letter makes another name ("Tùng" is not "Hưng"), so letters may differ only after it.
    return a === b || (a[0] === b[0] && editDistance(a, b) <= Math.max(1, Math.floor(b.length / 8)))
  })
  if (near.length) {
    return { match: 'mismatch', studentId: null, candidates: near.map((s) => s.id), reason: `"${spoken}" is close to, but not the same as, a name in the class.` }
  }
  return { match: 'unknown', studentId: null, candidates: [], reason: `"${spoken}" is not in the class list.` }
}

// Time words speech recognition may glue to a name, often with a capital letter: "bé Minh Mai mang..."
// for "bé Minh, mai (tomorrow) mang...".
const TIME_WORDS = new Set(['mai', 'nay', 'sáng', 'trưa', 'chiều', 'tối', 'hôm', 'qua'])

// Words for adults. A name right after one is a teacher's or a parent's ("cô Mai", "phụ huynh Mai"),
// or names a child's parents ("mẹ Mai"), or is not a name at all ("phụ huynh mai mang" = tomorrow).
export const ADULT_WORDS = new Set(['cô', 'thầy', 'mẹ', 'bố', 'cha', 'huynh', 'chú', 'bác', 'ông', 'bà', 'dì', 'cậu', 'mợ', 'thím', 'chị', 'giáo'])

/**
 * The name the teacher meant, when words were added to it:
 *   - a name said again in full: "Huy Lê Gia Huy" -> "Lê Gia Huy"
 *   - a time word glued to it: "Minh Mai" ("mai" = tomorrow) -> "Minh"
 * Only when the result is written exactly like one child's name; otherwise the name is kept as spoken,
 * and matchStudentName reports it for the teacher to check.
 */
export function refineSpokenName(spoken, students) {
  if (!spoken || matchStudentName(spoken, students).match === 'exact') return spoken
  const words = nameWords(spoken)
  for (let start = 1; start <= words.length - 2; start++) {
    const tail = words.slice(start).join(' ')
    if (students.filter((s) => wordsOf(s).join(' ') === tail).length === 1) return tail
  }
  let end = words.length
  while (end > 1 && TIME_WORDS.has(words[end - 1])) end--
  if (end < words.length && matchStudentName(words.slice(0, end).join(' '), students).match === 'exact') return words.slice(0, end).join(' ')
  return spoken
}

/**
 * The word for an adult before `name` when, every time the transcript says the name, it comes right after
 * such a word ("nhờ phụ huynh Mai mang..."); otherwise null. Such a name is never given to a child without the
 * teacher's confirmation.
 */
export function adultWordBefore(name, transcript) {
  const words = normalize(transcript).split(' ')
  const target = nameWords(name)
  let before = null
  for (let i = 0; i + target.length <= words.length; i++) {
    if (words.slice(i, i + target.length).join(' ') !== target.join(' ')) continue
    if (i === 0 || !ADULT_WORDS.has(words[i - 1])) return null
    before ??= words[i - 1]
  }
  return before
}

// Words that follow "bé" / "bạn" in speech without being a name: "bé rất ngoan", "bạn nào".
const NOT_A_NAME = new Set(
  ('nào nhỏ lớn ngoan rất cũng đã đều hơi bị được có không ăn ngủ học chơi vui buồn khóc cười tự thì và với nữa này đó ấy kia ' +
    'trai gái nam nữ mình ơi ạ nhé cả tất hôm trong ngồi đi ra vào uống làm hát múa vẽ đọc tập mới lại sau trước khác còn vẫn cùng ' +
    'đang sẽ hay thích muốn nên phải chưa mà thôi lắm quá ở về tới từ cho của khi lúc ngày mai sáng trưa chiều tối bé bạn con em cháu').split(' '),
)

/**
 * Finds the children a sentence names, the way a teacher says them: by full name, last two words,
 * given name or nickname, or "bé"/"bạn"/... followed by a word that may be a name.
 * Used by the keyword engine, which has no AI to point out the names for it.
 * @returns {string[]} the names as written in the text
 */
export function findSpokenNames(text, students) {
  const words = normalize(text).split(' ')
  const found = []
  const forms = new Set(
    students.flatMap((s) => {
      const w = wordsOf(s)
      return [w.join(' '), w.slice(-2).join(' '), w.slice(-1).join(' '), s.nickname ? normalize(s.nickname) : null].filter(Boolean)
    }),
  )
  for (let i = 0; i < words.length; i++) {
    const prefixed = CHILD_PREFIXES.includes(words[i]) && words[i - 1] !== 'các' && words[i + 1] && !NOT_A_NAME.has(words[i + 1])
    // Longest known form first, so "Trần Bảo Ngọc" wins over "Ngọc".
    let hit = null
    for (let length = 4; length >= 1 && !hit; length--) {
      const start = prefixed ? i + 1 : i
      const candidate = words.slice(start, start + length).join(' ')
      if (forms.has(candidate) && (prefixed || length >= 2)) hit = { name: candidate, end: start + length }
    }
    if (!hit && prefixed) {
      // Not a known form, but said like a name ("bé Tuấn Kiệt", "bạn Trần Bảo Ngoc"):
      // keep up to three name-like words for the teacher to check.
      let end = i + 1
      while (end < words.length && end < i + 4 && !NOT_A_NAME.has(words[end])) end++
      hit = { name: words.slice(i + 1, end).join(' '), end }
    }
    if (hit) {
      found.push(hit.name)
      i = hit.end - 1
    }
  }
  return [...new Set(found)]
}
