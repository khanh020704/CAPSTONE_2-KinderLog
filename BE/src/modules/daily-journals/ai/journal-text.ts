// Text helpers shared by the keyword engine, the AI engine, the checks of their output and the journal service.
import type { SectionKey } from './journal-draft.schema';

export const joinText = (...parts: (string | null | undefined)[]) => parts.filter((p) => p?.trim()).join(' ');

/** Checked in this order; a sentence that matches none goes to `note`. */
export const SECTION_KEYWORDS: Record<Exclude<SectionKey, 'note'>, string[]> = {
  sleep: ['ngủ', 'giấc', 'nghỉ trưa'],
  meal: ['ăn', 'bữa', 'cơm', 'cháo', 'súp', 'canh', 'phở', 'sữa', 'uống'],
  health: ['sức khỏe', 'sức khoẻ', 'sốt', 'ho', 'ốm', 'mệt', 'đau', 'sổ mũi', 'thuốc', 'ngã', 'nôn', 'trầy'],
  emotion: ['vui', 'buồn', 'khóc', 'cười', 'hào hứng', 'ngoan', 'hoạt bát', 'thích thú', 'quấy'],
  learning: [
    'học',
    'vẽ',
    'hát',
    'kể chuyện',
    'chơi',
    'hoạt động',
    'tập',
    'đọc',
    'múa',
    'tô màu',
    'đếm',
    'xếp hình',
  ],
};
const TOPICS = Object.keys(SECTION_KEYWORDS) as (keyof typeof SECTION_KEYWORDS)[];

const words = (text: string) =>
  ` ${String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

/** The topics a sentence is about, by its words: "Bé An ăn nửa suất cơm." -> ['meal']. */
export const topicsOf = (text: string): SectionKey[] =>
  TOPICS.filter((key) => SECTION_KEYWORDS[key].some((kw) => words(text).includes(` ${kw} `)));

/** The sentences of a section or a note, as the journal joins them. */
export const sentencesOf = (text: string | null | undefined) =>
  String(text ?? '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** The text without one of its sentences: a corrected statement taken out of a note or a section. */
export const withoutSentence = (text: string | null | undefined, sentence: string) =>
  sentencesOf(text)
    .filter((s) => s !== sentence)
    .join(' ');

/** Adds new text to old, leaving out sentences the old text already has word for word. */
export const joinNew = (old: string | null | undefined, text: string | null | undefined) =>
  joinText(
    old,
    sentencesOf(text)
      .filter((s) => !sentencesOf(old).includes(s))
      .join(' '),
  );
