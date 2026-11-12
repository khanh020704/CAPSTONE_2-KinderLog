// Checks a journal draft before the teacher sees it, in plain code, whichever engine made it.
//
// Input: entries of the form { section, status, text, mentions: [{ spoken, studentId }] }, where studentId is only
// a suggestion. Output: the same entries with the children they are verifiably about, plus `issues` for everything
// the teacher must confirm:
//   - a name that is not exactly a child of the class (misspelled, wrong surname, unknown, shared)
//   - a statement about a child whose name was not given
//   - a statement shared with the whole class that names a child
//   - contradictions, unclear statements, unusual health information, medical words nobody said
//   - what is said about a child that does not fit the day's attendance (absent, yet ate lunch)
//   - a further recording that corrects an earlier one ("Cô nhầm, bé An ăn hết suất")
// A statement with an unresolved child is held back: it reaches neither the class sections nor any child's note
// until the teacher decides where it goes. Nothing is corrected silently.
import { randomBytes } from 'node:crypto';
import {
  emptySections,
  ENTRY_STATUSES,
  EntryStatus,
  PersonalNotes,
  ReportedIssue,
  ReportEntry,
  RosterEntry,
  SECTION_KEYS,
  SectionKey,
  Sections,
} from './journal-draft.schema';
import { joinText, sentencesOf, topicsOf, withoutSentence } from './journal-text';
import {
  adultWordBefore,
  CHILD_PREFIXES,
  last,
  matchStudentName,
  normalize,
  refineSpokenName,
  toneless,
} from './vietnamese-names';

export const ISSUE_TYPES = [
  'unknown_student', // the name is not in the class list
  'ambiguous_student', // several children have that name
  'name_mismatch', // close to a child's name, but not the same
  'missing_student', // about one child, but no name was given
  'child_named_in_class_text', // a statement shared with every parent names a child
  'contradiction', // two statements about the same children disagree
  'unclear', // the meaning is not clear enough to record
  'health_alert', // unusual health information: record it as said, check it, never diagnose
  'unsupported_content', // the draft contains medical words the teacher did not say
  'attendance_mismatch', // what is said about a child does not fit how the child was marked that day
  'correction', // a further recording corrects an earlier statement
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const RESOLUTIONS = ['assigned', 'class', 'discarded', 'confirmed', 'reverted'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Issues that hold their statement back until the teacher says where it goes. */
export const HOLDING_TYPES = new Set<IssueType>([
  'unknown_student',
  'ambiguous_student',
  'name_mismatch',
  'missing_student',
  'child_named_in_class_text',
]);

export interface ReviewIssue {
  id: string;
  type: IssueType;
  section: SectionKey;
  /** The statement this is about. */
  text: string;
  /** A correction: the statement it replaced. */
  previousText: string | null;
  message: string;
  spokenNames: string[];
  /** Children the name could be, closest first (name issues only). */
  candidates: string[];
  studentIds: string[];
  /** true = the statement is not in the journal yet; the teacher decides where it goes. */
  held: boolean;
  status: 'open' | 'resolved';
  resolution: Resolution | null;
  assignedTo: string[];
}

export interface CheckedEntry {
  section: SectionKey;
  status: EntryStatus;
  students: string[];
  text: string;
  held?: boolean;
  issueId?: string;
}

/** The day's attendance, as the review takes it: studentId → { status, note }. Children not in it were not marked. */
export type DayAttendance = Record<string, { status: 'present' | 'absent'; note: string }>;

export interface ExistingContent {
  sections: Sections;
  personal: PersonalNotes;
}

const issueId = () => `iss_${randomBytes(6).toString('hex')}`;

const MESSAGES = {
  unknown_student: (spoken: string) =>
    `"${spoken}" is not a child of this class. Choose the child this is about, or leave it out.`,
  ambiguous_student: (spoken: string) =>
    `More than one child could be "${spoken}". Choose which child this is about.`,
  name_mismatch: (spoken: string) =>
    `"${spoken}" does not exactly match a name in the class. Confirm which child this is about.`,
  missing_student: () =>
    'This is about one child, but no name was given. Choose the child, or keep it for the whole class.',
  // A name right after a word for an adult: an adult, the child's parents, or a word such as "mai" (tomorrow).
  said_after_adult: (spoken: string, adult: string) =>
    `"${spoken}" comes right after "${adult}": it may be an adult, a child's parents, or the word "${spoken.toLowerCase()}" (e.g. "mai" = tomorrow). Choose the child this is about, keep it for the whole class, or leave it out.`,
  child_named_in_class_text: (spoken: string) =>
    `This would be shown to every parent, but it names ${spoken}. Move it to that child's note, or confirm it is for the whole class.`,
  health_alert: () =>
    'Unusual health information. Check it before it reaches parents. KinderLog records what was said and does not diagnose.',
  unsupported_content: (words: string) =>
    `The draft uses medical words the teacher did not say (${words}). Check and correct the text.`,
  marked_away: (name: string, note: string) =>
    `${name} is marked absent on this day${note ? ` ("${note}")` : ''}, but this says what the child did in class. Check the attendance or correct the text.`,
  marked_present: (name: string) =>
    `${name} is marked present on this day, but this says the child was not at school. Check the attendance or correct the text.`,
  correction_applied: (before: string, after: string) =>
    `The new recording corrects an earlier statement: "${before}" was replaced with "${after}". Check it, or keep the earlier statement as well.`,
  correction_unclear: () =>
    'This sounds like a correction of an earlier recording, but it is not clear which statement it corrects, so nothing was replaced. Edit or remove the wrong statement before approving.',
  class_all_here: (names: string) =>
    `This tells every parent that the whole class was at school, but ${names} ${names.includes(',') ? 'are' : 'is'} marked absent on this day. Correct the text (for example "all but one child") or the attendance.`,
};

type NameIssue = 'unknown_student' | 'ambiguous_student' | 'name_mismatch';

// ---------- attendance ----------

// Words saying a child was not at school. "nghỉ trưa" (the nap) and "nghỉ ngơi" (a rest) are not among them.
const SAYS_AWAY =
  /(^| )(vang( mat)?|nghi (hoc|om|phep|o nha|hom nay)|xin nghi|duoc nghi|khong (di hoc|den lop|toi lop|di lop))( |$)/;
const saysAway = (text: string) => SAYS_AWAY.test(toneless(text));
// A statement that the whole class was at school: a word for being at school and one for "all".
// "Các con ăn uống đầy đủ" is about the meal, not attendance.
const AT_SCHOOL = /(^| )(di hoc|den lop|toi lop|co mat|si so|len lop)( |$)/;
const EVERYONE =
  /(^| )(day du|dong du|du ca|du si so|tat ca|ca lop deu|cac (ban|be|con) deu|khong (ban|be|con|ai) nao (nghi|vang))( |$)/;
const NOBODY_AWAY = /(^| )khong (ban|be|con|ai) nao (nghi|vang)( |$)/;
const saysAllHere = (text: string) => {
  const t = toneless(text);
  return NOBODY_AWAY.test(t) || (AT_SCHOOL.test(t) && EVERYONE.test(t));
};

// ---------- corrections between recordings ----------
// "Cô nhầm", "cô giáo nói nhầm rồi", "ghi nhầm", "đính chính", "sửa lại": the teacher says an earlier statement was
// wrong. "Bé lấy nhầm dép của bạn" is something that happened, not a correction, so "nhầm" alone is not enough.
const CORRECTION_WORDS =
  'co (giao )?(noi |ghi |bao )?nham( roi)?|(noi|ghi|bao) nham( roi)?|nham roi|(xin )?dinh chinh|sua lai|noi lai';
const CORRECTION = new RegExp(`(^| )(${CORRECTION_WORDS})( |$)`);
const IS_CORRECTION = new RegExp(`^(${CORRECTION_WORDS})$`);
const saysCorrection = (text: string) => CORRECTION.test(toneless(text));

const capitalise = (text: string) =>
  `${text[0].toUpperCase()}${text.slice(1)}${/[.!?…]$/.test(text) ? '' : '.'}`;

// The correction words are for the teacher, not for parents: "Cô nhầm, bé An ăn hết suất." -> "Bé An ăn hết suất."
function withoutCorrectionWords(text: string) {
  const clauses = text.split(/(?<=[,;:])\s+/);
  const kept = clauses.filter((c) => !saysCorrection(c) || toneless(c).split(' ').length > 6);
  const cleaned = (kept.length ? kept : clauses)
    .join(' ')
    .replace(/[,;:]\s*$/, '')
    .trim();
  return cleaned ? capitalise(cleaned) : text;
}

// ---------- names ----------

// "một bạn", "một bé" (a single child) but not "một vài bạn", "một số bạn" (some children).
const SINGLE_CHILD = new RegExp(`(^| )(một|1) (${CHILD_PREFIXES.join('|')})( |$)`);
// "Sáng nay con đến lớp đúng giờ": "con" / "em" as the subject is one child the teacher was talking about, never
// "các con" (the class). Who it is comes from the sentences around it, which only the teacher can confirm.
const ONE_CHILD_SUBJECT =
  /^((hôm nay|sáng nay|trưa nay|chiều nay|tối nay|buổi sáng|buổi trưa|buổi chiều|sáng|trưa|chiều|riêng|còn) )?(con|em) /;
const isAboutOneUnnamedChild = (text: string) =>
  SINGLE_CHILD.test(normalize(text)) || ONE_CHILD_SUBJECT.test(normalize(text));

interface ChildReference {
  studentId: string;
  phrase: string;
}

// Every way the teacher may refer to a child: "Trần Bảo Ngọc", "Bảo Ngọc", "bé Ngọc", "bạn Ngọc", nickname.
function childReferences(students: RosterEntry[]): ChildReference[] {
  return students.flatMap((s) => {
    const words = normalize(s.fullName).split(' ');
    const given = [last(words), s.nickname ? normalize(s.nickname) : ''].filter((g): g is string => !!g);
    return [
      { studentId: s.id, phrase: words.join(' ') },
      { studentId: s.id, phrase: words.slice(-2).join(' ') },
      ...given.flatMap((g) => CHILD_PREFIXES.map((p) => ({ studentId: s.id, phrase: `${p} ${g}` }))),
    ];
  });
}

function namedChildren(text: string, students: RosterEntry[], extra: ChildReference[] = []) {
  const padded = ` ${normalize(text)} `;
  return [
    ...new Set(
      [...childReferences(students), ...extra]
        .filter((r) => padded.includes(` ${r.phrase} `))
        .map((r) => r.studentId),
    ),
  ];
}

// The children a correction in the transcript is about: the child named right after the correction words
// ("cô nhầm, bé An ăn hết suất"), or, when nobody is named right after them, the child named last before them
// ("bé Minh không bị ốm, cô nhầm rồi"). Never every child of a long, unpunctuated recording.
function correctedChildren(transcript: string, students: RosterEntry[]) {
  const words = toneless(transcript).split(' ');
  const refs = childReferences(students).map((r) => ({ ...r, words: toneless(r.phrase).split(' ') }));
  const mentions: { at: number; end: number; studentId: string }[] = [];
  for (let i = 0; i < words.length; i++) {
    const found = refs
      .filter((r) => r.words.every((w, k) => words[i + k] === w))
      .sort((a, b) => b.words.length - a.words.length)[0];
    if (found) mentions.push({ at: i, end: i + found.words.length, studentId: found.studentId });
  }
  const markers: { at: number; end: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = 5; n >= 1; n--) {
      if (IS_CORRECTION.test(words.slice(i, i + n).join(' '))) {
        markers.push({ at: i, end: i + n });
        i += n - 1;
        break;
      }
    }
  }
  const ids = new Set<string>();
  for (const m of markers) {
    const next = mentions.find((x) => x.at >= m.end && x.at - m.end <= 3);
    const previous = last(mentions.filter((x) => x.end <= m.at));
    const chosen = next ?? previous;
    if (chosen) ids.add(chosen.studentId);
  }
  return ids;
}

// Words that carry what a statement says, to tell which of several earlier statements a correction is about.
const STOP = new Set(
  'be ban con em chau hom nay sang chieu trua co thi la da duoc va nhung rat hoi khong bi mot cac'.split(' '),
);
const contentWords = (text: string, nameWords: Set<string>) =>
  new Set(
    toneless(text)
      .split(' ')
      .filter((w) => w.length > 1 && !STOP.has(w) && !nameWords.has(w)),
  );

// The earlier statement a correction replaces: the only one of the same topic in the child's note (or the class
// section), or, among several, the one sharing clearly most words with it. Null when that is not clear.
function correctedStatement(entry: CheckedEntry, earlierText: string, students: RosterEntry[]) {
  const sameTopic = sentencesOf(earlierText).filter(
    (s) =>
      !entry.students.length ||
      topicsOf(s).includes(entry.section) ||
      (entry.section === 'note' && !topicsOf(s).length),
  );
  if (sameTopic.length <= 1) return sameTopic[0] ?? null;
  const nameWords = new Set(
    students.filter((s) => entry.students.includes(s.id)).flatMap((s) => toneless(s.fullName).split(' ')),
  );
  const said = contentWords(entry.text, nameWords);
  const scored = sameTopic
    .map((s) => ({ s, shared: [...contentWords(s, nameWords)].filter((w) => said.has(w)).length }))
    .sort((a, b) => b.shared - a.shared);
  return scored[0].shared >= 2 && scored[0].shared > scored[1].shared ? scored[0].s : null;
}

// A statement about several children goes into each child's note, and each child's parents read it. When it says
// different things about each ("Huy ngủ 1 tiếng, Linh ngủ hơi muộn"), it is cut into one piece per child, at sentence
// ends, commas, semicolons and "còn". A piece without a name continues the child before it. If a piece names two of
// them ("An và Huy cùng xếp hình"), or the text does not start with a name, it is about them together and stays whole.
function splitByChild(
  text: string,
  studentIds: string[],
  students: RosterEntry[],
  spoken: [string, string][],
) {
  const pieces = text
    .split(/(?<=[.!?;,])\s+|\s*;\s*|\s+(?=còn\s)/i)
    .map((p) =>
      p
        .trim()
        .replace(/^còn\s+/i, '')
        .replace(/[,;]$/, '')
        .trim(),
    )
    .filter(Boolean);
  if (pieces.length < 2) return null;
  const extra = spoken.map(([studentId, name]) => ({ studentId, phrase: normalize(name) }));
  const byChild = new Map<string, string[]>();
  let current: string | null = null;
  for (const piece of pieces) {
    const named = namedChildren(piece, students, extra).filter((id) => studentIds.includes(id));
    if (named.length > 1) return null;
    if (named.length) current = named[0];
    if (!current) return null;
    byChild.set(current, [...(byChild.get(current) ?? []), piece]);
  }
  if (byChild.size !== studentIds.length) return null;
  const join = (parts: string[]) => parts.reduce((all, p) => `${all}${/[.!?…]$/.test(all) ? ' ' : ', '}${p}`);
  return [...byChild].map(([studentId, parts]) => ({ studentId, text: capitalise(join(parts)) }));
}

// ---------- polarity, for contradictions ----------
// Each section has words that say things went well or badly. A bad word right after a negation ("không sốt",
// "hết ho") counts as good, so "không bạn nào bị ốm" is a good statement.

const LEXICON: Partial<Record<SectionKey, { good: string[]; bad: string[] }>> = {
  meal: {
    good: ['ăn hết', 'hết suất', 'ăn ngon', 'ăn tốt', 'ăn giỏi', 'ăn nhiều', 'xin thêm', 'ăn khỏe'],
    bad: ['bỏ ăn', 'không ăn', 'ăn ít', 'biếng ăn', 'bỏ bữa', 'không chịu ăn', 'nôn', 'ói'],
  },
  sleep: {
    good: ['ngủ ngon', 'ngủ say', 'ngủ sâu', 'ngủ đủ', 'ngủ tốt'],
    bad: ['không ngủ', 'khó ngủ', 'mất ngủ', 'ngủ ít', 'thức giấc', 'không chịu ngủ'],
  },
  health: {
    good: ['khỏe', 'bình thường', 'ổn định', 'không có biểu hiện'],
    bad: [
      'sốt',
      'ho',
      'nôn',
      'ói',
      'ốm',
      'mệt',
      'đau',
      'sổ mũi',
      'tiêu chảy',
      'ngã',
      'té',
      'chảy máu',
      'phát ban',
      'mẩn',
      'dị ứng',
      'sưng',
      'khó thở',
      'co giật',
      'bỏng',
      'ngất',
      'li bì',
      'trầy',
    ],
  },
  emotion: {
    good: ['vui', 'hào hứng', 'ngoan', 'thích thú', 'hoạt bát', 'vui vẻ'],
    bad: ['khóc', 'buồn', 'quấy', 'sợ', 'cáu', 'giận'],
  },
};
const NEGATIONS = new Set(['không', 'chưa', 'hết', 'đỡ']);
const BETWEEN = new Set(['bị', 'có', 'còn', 'thấy', 'hề']);
const NOBODY = /(^| )không (bạn|bé|con|cháu|em|ai)( nào)?( |$)/;

function hasTerm(text: string, term: string, negatable: boolean) {
  const words = ` ${normalize(text)} `;
  let at = words.indexOf(` ${term} `);
  while (at !== -1) {
    const before = words.slice(0, at).trim().split(' ').filter(Boolean);
    while (before.length && BETWEEN.has(last(before)!)) before.pop();
    const negated = negatable && (NEGATIONS.has(last(before) ?? '') || NOBODY.test(before.join(' ')));
    if (!negated) return true;
    at = words.indexOf(` ${term} `, at + 1);
  }
  return false;
}

export function polarity(section: SectionKey, text: string): 'good' | 'bad' | null {
  const lexicon = LEXICON[section];
  if (!lexicon) return null;
  const bad = lexicon.bad.some((term) => hasTerm(text, term, true));
  const good = lexicon.good.some((term) => hasTerm(text, term, false));
  if (bad && !good) return 'bad';
  if (good && !bad) return 'good';
  return null;
}

// "Bé Minh không bị ốm" against "Bé Minh bị ốm": the later statement denies a problem the other states.
function denies(section: SectionKey, text: string, other: string) {
  const lexicon = LEXICON[section];
  if (!lexicon) return false;
  return lexicon.bad.some(
    (term) =>
      ` ${normalize(text)} `.includes(` ${term} `) &&
      !hasTerm(text, term, true) &&
      hasTerm(other, term, true),
  );
}

const isHealthAlert = (text: string) => LEXICON.health!.bad.some((term) => hasTerm(text, term, true));

// Words that would turn a note into a diagnosis. They may only appear if the teacher said them.
const MEDICAL_WORDS = [
  'viêm',
  'nhiễm',
  'cúm',
  'virus',
  'vi rút',
  'bệnh',
  'chẩn đoán',
  'có thể bị',
  'nghi ngờ',
  'triệu chứng của',
  'sốt xuất huyết',
  'tay chân miệng',
];
function unsupportedMedicalWords(text: string, transcript: string) {
  const said = ` ${toneless(transcript)} `;
  return MEDICAL_WORDS.filter(
    (w) => ` ${toneless(text)} `.includes(` ${toneless(w)} `) && !said.includes(` ${toneless(w)} `),
  );
}

// ---------- review ----------

interface Statement {
  section: SectionKey;
  status: EntryStatus;
  text: string;
  subjects: string[];
  source?: 'existing';
}

function existingStatements(existing: ExistingContent | undefined, students: RosterEntry[]): Statement[] {
  if (!existing) return [];
  const known = new Set(students.map((s) => s.id));
  return [
    ...SECTION_KEYS.filter((section) => existing.sections[section]?.trim()).map((section): Statement => ({
      section,
      status: 'all',
      text: existing.sections[section],
      subjects: ['class'],
      source: 'existing',
    })),
    // A child's note mixes topics, so it is compared with every section it has words for.
    ...Object.entries(existing.personal)
      .filter(([id, text]) => known.has(id) && text?.trim())
      .flatMap(([id, text]) =>
        (Object.keys(LEXICON) as SectionKey[])
          .filter((section) => polarity(section, text))
          .map((section): Statement => ({
            section,
            status: 'named',
            text,
            subjects: [id],
            source: 'existing',
          })),
      ),
  ];
}

export interface ReviewInput {
  entries: ReportEntry[];
  /** Active students of the class. */
  students: RosterEntry[];
  /** What the teacher said, to tell said words from added ones. */
  transcript: string;
  /** Contradictions and unclear statements the AI noticed. */
  reported?: ReportedIssue[];
  /** What the journal already says (when recording more). */
  existing?: ExistingContent;
  attendance?: DayAttendance;
}

export function reviewDraft({
  entries,
  students,
  transcript,
  reported = [],
  existing,
  attendance = {},
}: ReviewInput): { entries: CheckedEntry[]; issues: ReviewIssue[] } {
  const issues: ReviewIssue[] = [];
  const add = (issue: Partial<ReviewIssue> & Pick<ReviewIssue, 'type' | 'section' | 'message'>) => {
    const full: ReviewIssue = {
      id: issueId(),
      text: '',
      previousText: null,
      spokenNames: [],
      candidates: [],
      studentIds: [],
      held: HOLDING_TYPES.has(issue.type),
      status: 'open',
      resolution: null,
      assignedTo: [],
      ...issue,
    };
    issues.push(full);
    return full;
  };

  type Working = CheckedEntry & { issue?: ReviewIssue; corrected?: boolean };
  const checked: Working[] = [];
  for (const raw of entries) {
    const text = String(raw.text ?? '').trim();
    if (!text || !SECTION_KEYS.includes(raw.section) || !ENTRY_STATUSES.includes(raw.status)) continue;
    const entry: Working = { section: raw.section, status: raw.status, text, students: [], held: false };
    const classWide = raw.status === 'all' || raw.status === 'nobody';

    if (classWide) {
      // Shown to every parent, so it must not single out a child.
      const named = namedChildren(text, students);
      if (named.length) {
        const names = students.filter((s) => named.includes(s.id)).map((s) => s.fullName);
        entry.held = true;
        entry.issue = add({
          type: 'child_named_in_class_text',
          section: entry.section,
          text,
          studentIds: named,
          candidates: named,
          spokenNames: names,
          message: MESSAGES.child_named_in_class_text(names.join(', ')),
        });
      }
      checked.push(entry);
      continue;
    }

    // Every child the statement mentions must be exactly a child of the class.
    const unresolved: { spoken: string; type: IssueType; candidates: string[]; adult?: string }[] = [];
    const spokenNames: [string, string][] = [];
    for (const mention of raw.mentions ?? []) {
      // "Huy Lê Gia Huy" (said again in full) -> "Lê Gia Huy", "Minh Mai" (mai = tomorrow) -> "Minh".
      const spoken = refineSpokenName(String(mention.spoken ?? '').trim(), students);
      const result = spoken ? matchStudentName(spoken, students) : null;
      const adult = result?.match === 'exact' ? adultWordBefore(spoken, transcript) : null;
      if (result?.match === 'exact' && adult) {
        unresolved.push({ spoken, type: 'ambiguous_student', candidates: [result.studentId], adult });
      } else if (
        result?.match === 'exact' &&
        (!mention.studentId || mention.studentId === result.studentId)
      ) {
        entry.students.push(result.studentId);
        spokenNames.push([result.studentId, spoken]);
      } else if (result?.match === 'exact') {
        unresolved.push({
          spoken,
          type: 'ambiguous_student',
          candidates: [result.studentId, mention.studentId!],
        });
      } else if (result) {
        const type = (
          { ambiguous: 'ambiguous_student', mismatch: 'name_mismatch', unknown: 'unknown_student' } as const
        )[result.match];
        unresolved.push({ spoken, type, candidates: result.candidates });
      } else if (mention.studentId) {
        unresolved.push({ spoken: '', type: 'missing_student', candidates: [mention.studentId] });
      }
    }
    entry.students = [...new Set(entry.students)];

    if (unresolved.length) {
      const first = unresolved[0];
      const spoken = unresolved.map((u) => u.spoken).filter(Boolean);
      const type = unresolved.every((u) => u.type === first.type) ? first.type : 'name_mismatch';
      const say: (s: string) => string =
        first.type === 'missing_student' ? MESSAGES.missing_student : MESSAGES[first.type as NameIssue];
      entry.held = true;
      entry.issue = add({
        type,
        section: entry.section,
        text,
        spokenNames: spoken,
        candidates: [...new Set(unresolved.flatMap((u) => u.candidates))].filter((id) =>
          students.some((s) => s.id === id),
        ),
        studentIds: entry.students,
        message: first.adult ? MESSAGES.said_after_adult(first.spoken, first.adult) : say(spoken.join(', ')),
      });
    } else if (
      !entry.students.length &&
      (raw.status === 'named' ||
        isAboutOneUnnamedChild(text) ||
        (raw.section === 'health' && isHealthAlert(text)))
    ) {
      // About a child, but which one? Health incidents of an unnamed child are never shared with every parent.
      // The child named just before is offered first: "Bé Minh… Sáng nay con…" is usually still about Minh.
      const previous = last(checked)?.students ?? [];
      entry.held = true;
      entry.issue = add({
        type: 'missing_student',
        section: entry.section,
        text,
        candidates: previous.length === 1 ? previous : [],
        message: MESSAGES.missing_student(),
      });
    } else if (entry.students.length > 1) {
      // One piece per child, so no parent reads what was said about another child.
      const pieces = splitByChild(text, entry.students, students, spokenNames);
      if (pieces) {
        for (const piece of pieces) checked.push({ ...entry, text: piece.text, students: [piece.studentId] });
        continue;
      }
    }
    checked.push(entry);
  }

  // A further recording that corrects an earlier one. Only a correction the teacher says ("cô nhầm"), about one child
  // (or the class) in this journal, with exactly one earlier statement it can be about, replaces that statement; the
  // replacement is a point to confirm and can be undone. Anything less clear replaces nothing.
  const earlier: ExistingContent = {
    sections: { ...emptySections(), ...existing?.sections },
    personal: { ...existing?.personal },
  };
  if (existing) {
    const said = sentencesOf(transcript).length ? sentencesOf(transcript) : [transcript];
    const correctedIds = correctedChildren(transcript, students);
    // "Cô nhầm rồi" cut off on its own says nothing to parents: it only marks the statement after it.
    const onlyCorrectionWords = (e: Working) =>
      saysCorrection(e.text) &&
      toneless(e.text)
        .replace(CORRECTION, ' ')
        .replace(/(roi|a|nhe|nha|nhes|day|la|thi)/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean).length <= 1;
    for (const e of checked.filter(onlyCorrectionWords)) checked.splice(checked.indexOf(e), 1);
    const open = checked.filter((e) => !e.held);
    for (const entry of open) {
      if (entry.students.length > 1) continue;
      const childId = entry.students[0];
      const correcting =
        saysCorrection(entry.text) ||
        (childId
          ? correctedIds.has(childId)
          : said.some((s) => saysCorrection(s) && !namedChildren(s, students).length)) ||
        (open.length === 1 && saysCorrection(transcript));
      if (!correcting) continue;
      entry.text = withoutCorrectionWords(entry.text);
      const earlierText = childId ? earlier.personal[childId] : earlier.sections[entry.section];
      const before = earlierText ? correctedStatement(entry, earlierText, students) : null;
      if (!before) {
        add({
          type: 'correction',
          section: entry.section,
          text: entry.text,
          studentIds: entry.students,
          message: MESSAGES.correction_unclear(),
        });
        continue;
      }
      if (childId) earlier.personal[childId] = withoutSentence(earlierText, before);
      else earlier.sections[entry.section] = withoutSentence(earlierText, before);
      entry.corrected = true;
      add({
        type: 'correction',
        section: entry.section,
        text: entry.text,
        previousText: before,
        studentIds: entry.students,
        message: MESSAGES.correction_applied(before, entry.text),
      });
    }
  }

  // What is said about a child must fit the day's attendance. A child marked absent may still be talked about: why
  // they are away, or a message to their parents (a note); anything they did in class is checked.
  for (const entry of checked) {
    for (const studentId of entry.students) {
      const record = attendance[studentId];
      if (!record) continue;
      const name = students.find((s) => s.id === studentId)?.fullName ?? 'This child';
      const away = record.status === 'absent';
      if (away && entry.section !== 'note' && !saysAway(entry.text)) {
        add({
          type: 'attendance_mismatch',
          section: entry.section,
          text: entry.text,
          studentIds: [studentId],
          message: MESSAGES.marked_away(name, record.note),
        });
      } else if (!away && saysAway(entry.text)) {
        add({
          type: 'attendance_mismatch',
          section: entry.section,
          text: entry.text,
          studentIds: [studentId],
          message: MESSAGES.marked_present(name),
        });
      }
    }
  }
  // A statement for every parent that the whole class was there, on a day a child is marked absent.
  const awayIds = students.filter((s) => attendance[s.id]?.status === 'absent').map((s) => s.id);
  if (awayIds.length) {
    for (const entry of checked.filter((e) => !e.students.length && saysAllHere(e.text))) {
      const names = students
        .filter((s) => awayIds.includes(s.id))
        .map((s) => s.fullName)
        .join(', ');
      add({
        type: 'attendance_mismatch',
        section: entry.section,
        text: entry.text,
        studentIds: awayIds,
        message: MESSAGES.class_all_here(names),
      });
    }
  }

  // Medical words the teacher never said, and unusual health information about a child.
  for (const entry of checked) {
    const added = unsupportedMedicalWords(entry.text, transcript);
    if (added.length) {
      add({
        type: 'unsupported_content',
        section: entry.section,
        text: entry.text,
        studentIds: entry.students,
        message: MESSAGES.unsupported_content(added.join(', ')),
      });
    }
    if ((entry.students.length || entry.held) && isHealthAlert(entry.text) && entry.status !== 'nobody') {
      add({
        type: 'health_alert',
        section: entry.section,
        text: entry.text,
        studentIds: entry.students,
        message: MESSAGES.health_alert(),
      });
    }
  }

  // Contradictions: the same children, the same topic, one good and one bad statement.
  const statements: Statement[] = [
    ...checked
      .filter((e) => !e.held || e.students.length)
      .map((e) => ({ ...e, subjects: e.students.length ? e.students : ['class'] })),
    ...existingStatements(existing && earlier, students),
  ];
  const contradictions = new Map<string, { section: SectionKey; shared: string[]; texts: Set<string> }>();
  for (const a of statements) {
    for (const b of statements) {
      if (a === b || a.section !== b.section || (a.source === 'existing' && b.source === 'existing'))
        continue;
      const shared = a.subjects.filter((s) => b.subjects.includes(s));
      const opposed =
        (polarity(a.section, a.text) === 'good' && polarity(b.section, b.text) === 'bad') ||
        denies(a.section, a.text, b.text);
      if (!shared.length || !opposed) continue;
      const key = `${a.section}:${shared.sort().join(',')}`;
      if (!contradictions.has(key)) contradictions.set(key, { section: a.section, shared, texts: new Set() });
      contradictions.get(key)!.texts.add(a.text).add(b.text);
    }
  }
  // "Không bạn nào bị ốm" disagrees with any child being unwell.
  const nobodyUnwell = statements.filter((s) => s.section === 'health' && s.status === 'nobody');
  const someoneUnwell = statements.filter((s) => s.status !== 'nobody' && isHealthAlert(s.text));
  if (nobodyUnwell.length && someoneUnwell.length) {
    contradictions.set('health:class', {
      section: 'health',
      shared: someoneUnwell.flatMap((s) => s.subjects).filter((s) => s !== 'class'),
      texts: new Set([...nobodyUnwell, ...someoneUnwell].map((s) => s.text)),
    });
  }
  for (const { section, shared, texts } of contradictions.values()) {
    add({
      type: 'contradiction',
      section,
      text: [...texts].join(' / '),
      studentIds: shared.filter((s) => s !== 'class'),
      message:
        'These statements disagree with each other. Check what really happened and correct the text before approving.',
    });
  }

  // What the AI noticed and the code could not: kept as reported, never acted on.
  for (const r of reported) {
    if (!['contradiction', 'unclear'].includes(r.type) || !String(r.message ?? '').trim()) continue;
    const ids = (r.studentIds ?? []).filter((id) => students.some((s) => s.id === id));
    const duplicate =
      r.type === 'contradiction' &&
      issues.some(
        (i) =>
          i.type === 'contradiction' &&
          i.section === r.section &&
          ids.every((id) => i.studentIds.includes(id)),
      );
    if (!duplicate) {
      add({
        type: r.type,
        section: SECTION_KEYS.includes(r.section) ? r.section : 'note',
        text: String(r.text ?? '').trim(),
        studentIds: ids,
        message: String(r.message).trim(),
      });
    }
  }

  // The class first, then each child in class-list order.
  const order = new Map(students.map((s, i) => [s.id, i]));
  const rank = (e: CheckedEntry) =>
    e.students.length ? 1 + Math.min(...e.students.map((id) => order.get(id) ?? 999)) : 0;
  checked.sort(
    (a, b) => rank(a) - rank(b) || SECTION_KEYS.indexOf(a.section) - SECTION_KEYS.indexOf(b.section),
  );

  return {
    entries: checked.map(({ section, status, text, students: ids, held, issue }) => ({
      section,
      status,
      students: ids,
      text,
      ...(held && { held: true, issueId: issue?.id }),
    })),
    issues,
  };
}

/**
 * Builds the two layers of a journal from checked entries:
 *   - an entry about listed children becomes a private note for each of them
 *   - every other entry joins its section, shared with every parent
 * Held entries wait in their issue; entries about children not in the class are dropped.
 */
export function assembleDraft(entries: CheckedEntry[], students: RosterEntry[]) {
  const inClass = new Set(students.map((s) => s.id));
  const sections = emptySections();
  const personal: PersonalNotes = {};
  const kept: CheckedEntry[] = [];

  for (const entry of entries) {
    const text = String(entry.text ?? '').trim();
    if (!text || !SECTION_KEYS.includes(entry.section) || !ENTRY_STATUSES.includes(entry.status)) continue;
    if (entry.held) {
      kept.push(entry);
      continue;
    }
    const classWide = entry.status === 'all' || entry.status === 'nobody';
    const about = classWide ? [] : [...new Set(entry.students)].filter((id) => inClass.has(id));
    if (entry.status === 'named' && !about.length) continue;

    if (about.length) for (const id of about) personal[id] = joinText(personal[id], text);
    else sections[entry.section] = joinText(sections[entry.section], text);
    kept.push({ section: entry.section, status: entry.status, students: about, text });
  }
  return { sections, personal, entries: kept };
}
