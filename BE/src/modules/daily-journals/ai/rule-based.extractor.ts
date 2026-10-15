import { Injectable } from '@nestjs/common';
import { AttendanceStatus, HealthStatus, MealLevel, Mood, SleepQuality } from '../../../common/enums';
import { JournalDraft, JournalExtractor, JournalPatch, RosterEntry } from './journal-draft.schema';

/**
 * Offline extractor used when AI_MODE=mock (no API keys, no internet – safe for a live demo).
 * Splits the transcript into sentences; a sentence naming a child becomes that child's exception,
 * everything else describes the whole class. Keyword rules mirror the FE's draftFromTranscript().
 */
const KW = {
  absent: ['nghỉ học', 'vắng', 'xin nghỉ', 'không đi học', 'nghỉ ốm'],
  meal: ['ăn', 'bữa', 'cơm', 'cháo', 'súp', 'canh', 'phở', 'sữa', 'uống'],
  sleep: ['ngủ', 'giấc'],
  health: ['sức khỏe', 'sức khoẻ', 'sốt', 'ho', 'ốm', 'mệt', 'đau', 'sổ mũi', 'nôn', 'thuốc', 'nhiệt độ'],
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
const CHILD_PREFIXES = ['bé', 'bạn', 'con', 'em', 'cháu'];

const empty = (): JournalPatch => ({
  attendance: null,
  absenceReason: null,
  mealLevel: null,
  mealNote: null,
  sleepMinutes: null,
  sleepQuality: null,
  learningNote: null,
  healthStatus: null,
  temperature: null,
  healthNote: null,
  mood: null,
  teacherNote: null,
});

/** Lower-cased, punctuation-free and space-padded, so ` ${word} ` matches whole words only ("ho" ≠ "học"). */
const norm = (s: string) =>
  ` ${s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[,;:.!?"“”()]/g, ' ')
    .replace(/\s+/g, ' ')} `;
const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(` ${w} `));
const appendText = (a: string | null, b: string) => (a ? `${a} ${b}` : b);

// In Vietnamese "sốt" is both fever and sauce. It is a sauce right after a food word ("cá sốt", "nước sốt")
// or right before a sauce name ("sốt cà chua", "sốt vang"); those occurrences are removed before health rules run.
const FOODS = 'thịt|viên|cá|gà|tôm|mực|đậu|trứng|sườn|bò|heo|nước|mì|bún|cơm|rau|nấm|chả';
const SAUCES = 'cà chua|cà|vang|me|chua ngọt|bơ|tiêu|nấm|dầu hào|cam|kem|phô mai|thái|tỏi';
const SAUCE_AFTER_FOOD = new RegExp(` (${FOODS}) sốt(?= )`, 'g');
const SAUCE_NAME = new RegExp(` sốt (${SAUCES})(?= )`, 'g');
const withoutSauce = (t: string) => t.replace(SAUCE_AFTER_FOOD, ' $1').replace(SAUCE_NAME, ' ');

function mealLevel(t: string): MealLevel | null {
  if (hasAny(t, ['không ăn', 'bỏ bữa', 'bỏ ăn'])) return MealLevel.NONE;
  if (hasAny(t, ['ăn ít', 'biếng ăn', 'ăn chậm', 'ăn rất ít'])) return MealLevel.LITTLE;
  if (hasAny(t, ['một nửa', 'nửa suất', 'ăn được nửa'])) return MealLevel.HALF;
  if (hasAny(t, ['gần hết', 'ăn khá', 'ăn tốt'])) return MealLevel.MOST;
  if (hasAny(t, ['ăn hết', 'hết suất', 'ăn sạch', 'ngon miệng', 'xin thêm'])) return MealLevel.ALL;
  return null;
}

function sleepMinutes(t: string): number | null {
  const min = t.match(/(\d+)\s*phút/);
  if (min) return Number(min[1]);
  const hr = t.match(/(\d+(?:[.,]\d+)?)\s*(?:tiếng|giờ)(\s*rưỡi)?/);
  if (hr) return Math.round(Number(hr[1].replace(',', '.')) * 60 + (hr[2] ? 30 : 0));
  return null;
}

function temperature(t: string): number | null {
  const m = t.match(/(3[5-9]|4[0-2])(?:[.,]|\s*độ\s*|\s*phẩy\s*)(\d)?/);
  return m ? Number(`${m[1]}.${m[2] ?? 0}`) : null;
}

/** What one sentence says, as a partial journal. */
function parseSentence(sentence: string): Partial<JournalPatch> {
  const t = norm(sentence);
  const raw = sentence.normalize('NFC').toLowerCase(); // keeps "37,8" and "1,5 tiếng" intact for number parsing
  const out: Partial<JournalPatch> = {};
  let matched = false;

  if (hasAny(t, KW.absent)) {
    out.attendance = AttendanceStatus.ABSENT;
    out.absenceReason = sentence;
    return out;
  }
  if (hasAny(t, KW.meal) && !hasAny(t, KW.sleep)) {
    out.mealLevel = mealLevel(t);
    out.mealNote = sentence;
    matched = true;
  }
  if (hasAny(t, KW.sleep)) {
    out.sleepMinutes = sleepMinutes(raw);
    if (hasAny(t, ['không ngủ', 'không chịu ngủ'])) {
      out.sleepQuality = SleepQuality.NONE;
      out.sleepMinutes = 0;
    } else if (hasAny(t, ['khó ngủ', 'trằn trọc', 'giật mình', 'ngủ ít']))
      out.sleepQuality = SleepQuality.POOR;
    else if (hasAny(t, ['ngủ ngon', 'ngủ sâu', 'ngủ say'])) out.sleepQuality = SleepQuality.GOOD;
    else out.sleepQuality = SleepQuality.FAIR;
    matched = true;
  }
  const th = withoutSauce(t); // "thịt viên sốt cà chua" is a dish, not a fever
  if (hasAny(th, KW.health)) {
    out.temperature = temperature(raw);
    out.healthStatus = hasAny(th, ['sốt', 'nôn', 'ốm', 'đau'])
      ? HealthStatus.SICK
      : hasAny(th, ['ho', 'sổ mũi', 'mệt'])
        ? HealthStatus.MONITOR
        : HealthStatus.NORMAL;
    out.healthNote = sentence;
    matched = true;
  }
  if (hasAny(t, ['vui', 'hào hứng', 'thích thú', 'hoạt bát', 'phấn khởi'])) out.mood = Mood.HAPPY;
  else if (hasAny(t, ['buồn', 'khóc', 'quấy'])) out.mood = Mood.SAD;
  else if (hasAny(t, ['mệt', 'uể oải'])) out.mood = Mood.TIRED;
  else if (hasAny(t, ['ngoan'])) out.mood = Mood.CALM;
  if (out.mood) matched = true;

  if (hasAny(t, KW.learning) && !out.mealNote && !out.healthNote) {
    out.learningNote = sentence;
    matched = true;
  }
  if (!matched) out.teacherNote = sentence;
  return out;
}

const TEXT_FIELDS = new Set<keyof JournalPatch>([
  'absenceReason',
  'mealNote',
  'learningNote',
  'healthNote',
  'teacherNote',
]);
const HEALTH_RANK = { NORMAL: 0, MONITOR: 1, SICK: 2 } as const;

/** Notes accumulate sentence by sentence; enums/numbers take the latest value (health keeps the most severe). */
function merge(into: JournalPatch, add: Partial<JournalPatch>) {
  for (const [k, v] of Object.entries(add) as [keyof JournalPatch, unknown][]) {
    if (v == null) continue;
    const cur = into[k];
    if (TEXT_FIELDS.has(k))
      (into as Record<string, unknown>)[k] = appendText(cur as string | null, v as string);
    else if (k === 'healthStatus' && cur && HEALTH_RANK[cur as HealthStatus] > HEALTH_RANK[v as HealthStatus])
      continue;
    else (into as Record<string, unknown>)[k] = v;
  }
}

/** Which children a sentence is about: full name, last two words, or "bé An" when the given name is unique. */
function mentioned(sentence: string, roster: RosterEntry[]): string[] {
  const t = norm(sentence);
  const hits = new Set<string>();
  const byGiven = new Map<string, RosterEntry[]>();
  for (const s of roster) {
    const words = s.fullName.normalize('NFC').toLowerCase().split(/\s+/);
    if (t.includes(` ${words.join(' ')} `) || t.includes(` ${words.slice(-2).join(' ')} `)) hits.add(s.id);
    const given = words[words.length - 1];
    byGiven.set(given, [...(byGiven.get(given) ?? []), s]);
  }
  for (const [given, list] of byGiven) {
    const said = CHILD_PREFIXES.some(
      (p) => t.includes(` ${p} ${given} `) && !t.includes(` các ${p} ${given} `),
    );
    if (said && list.length === 1) hits.add(list[0].id);
  }
  return [...hits];
}

@Injectable()
export class RuleBasedJournalExtractor implements JournalExtractor {
  readonly name = 'rule-based';

  extract(transcript: string, roster: RosterEntry[]): Promise<JournalDraft> {
    const sentences = transcript
      .split(/[.!?\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${s[0].toUpperCase()}${s.slice(1)}.`);

    const classDefaults = empty();
    const exceptions = new Map<string, JournalPatch>();
    for (const sentence of sentences) {
      const about = mentioned(sentence, roster);
      const parsed = parseSentence(sentence);
      if (!about.length) {
        merge(classDefaults, parsed);
        continue;
      }
      for (const id of about) {
        const patch = exceptions.get(id) ?? empty();
        merge(patch, parsed);
        exceptions.set(id, patch);
      }
    }
    return Promise.resolve({
      classDefaults,
      exceptions: [...exceptions].map(([studentId, patch]) => ({ studentId, ...patch })),
      unrecognizedNames: [],
    });
  }
}
