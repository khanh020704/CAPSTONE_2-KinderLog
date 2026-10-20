// Shared by the keyword engine, the AI engine and the code that checks their output.

export const SECTION_KEYS = ['meal', 'learning', 'sleep', 'health', 'emotion', 'note']

// Who a statement is about: the whole class, some of it, no child, or children named by the teacher.
export const ENTRY_STATUSES = ['all', 'part', 'nobody', 'named']

export const joinText = (...parts) => parts.filter((p) => p?.trim()).join(' ')

// Checked in this order; a sentence that matches none goes to `note`.
export const SECTION_KEYWORDS = {
  sleep: ['ngủ', 'giấc', 'nghỉ trưa'],
  meal: ['ăn', 'bữa', 'cơm', 'cháo', 'súp', 'canh', 'phở', 'sữa', 'uống'],
  health: ['sức khỏe', 'sức khoẻ', 'sốt', 'ho', 'ốm', 'mệt', 'đau', 'sổ mũi', 'thuốc', 'ngã', 'nôn', 'trầy'],
  emotion: ['vui', 'buồn', 'khóc', 'cười', 'hào hứng', 'ngoan', 'hoạt bát', 'thích thú', 'quấy'],
  learning: ['học', 'vẽ', 'hát', 'kể chuyện', 'chơi', 'hoạt động', 'tập', 'đọc', 'múa', 'tô màu', 'đếm', 'xếp hình'],
}

// The topics a sentence is about, by its words: "Bé An ăn nửa suất cơm." -> ['meal'].
const words = (text) => ` ${String(text ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `
export const topicsOf = (text) => Object.keys(SECTION_KEYWORDS).filter((key) => SECTION_KEYWORDS[key].some((kw) => words(text).includes(` ${kw} `)))

// The sentences of a section or a note, as the journal joins them.
export const sentencesOf = (text) => String(text ?? '').split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)

// The text without one of its sentences: a corrected statement taken out of a note or a section.
export const withoutSentence = (text, sentence) => sentencesOf(text).filter((s) => s !== sentence).join(' ')

// Adds new text to old, leaving out sentences the old text already has word for word (the same thing said again).
export const joinNew = (old, text) => joinText(old, sentencesOf(text).filter((s) => !sentencesOf(old).includes(s)).join(' '))
