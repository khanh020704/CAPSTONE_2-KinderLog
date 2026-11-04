import { Injectable } from '@nestjs/common';
import {
  EntryStatus,
  ExtractedReport,
  JournalExtractor,
  ReportEntry,
  RosterEntry,
  SectionKey,
} from './journal-draft.schema';
import { SECTION_KEYWORDS } from './journal-text';
import { CHILD_PREFIXES, findSpokenNames, matchStudentName, normalize } from './vietnamese-names';

// Speech recognition rarely adds punctuation, so a report is also cut where a new subject or topic starts: before a
// child's name, "cả lớp", "các con", "rồi", "còn", "nhắn", "trừ"...
const BREAKS = [
  'cả lớp',
  'các con',
  'rồi',
  'còn',
  'sau đó',
  'buổi sáng',
  'buổi trưa',
  'buổi chiều',
  'nhắn',
  'nhờ',
  'trừ',
  'riêng',
  'không bạn nào',
  'không bé nào',
  'không con nào',
];

function cut(sentence: string, students: RosterEntry[]) {
  const words = sentence.split(/\s+/).filter(Boolean);
  const lower = words.map((w) => normalize(w));
  const starts = new Set([0]);
  for (let i = 1; i < words.length; i++) {
    const two = `${lower[i]} ${lower[i + 1] ?? ''}`;
    const three = `${two} ${lower[i + 2] ?? ''}`;
    if (BREAKS.includes(lower[i]) || BREAKS.includes(two) || BREAKS.includes(three)) starts.add(i);
    // "bé An", "bạn Ngọc": a child's name starts a new statement, unless it continues "các bạn".
    if (
      CHILD_PREFIXES.includes(lower[i]) &&
      lower[i - 1] !== 'các' &&
      findSpokenNames(`${words[i]} ${words[i + 1] ?? ''}`, students).length
    ) {
      starts.add(i);
    }
  }
  const points = [...starts].sort((a, b) => a - b);
  const parts = points.map((start, k) => words.slice(start, points[k + 1]));
  // A piece of one or two words ("Hôm nay", "rồi") is not a statement: it joins the next one.
  const merged: string[][] = [];
  for (let k = 0; k < parts.length; k++) {
    if (parts[k].length < 3 && k + 1 < parts.length) parts[k + 1] = [...parts[k], ...parts[k + 1]];
    else if (parts[k].length < 3 && merged.length) merged[merged.length - 1].push(...parts[k]);
    else merged.push(parts[k]);
  }
  return merged.map((part) => part.join(' '));
}

// A piece cut at a comma ends without it: "…của bé," -> "…của bé."
const capitalise = (piece: string) => {
  const text = piece.replace(/[,;:\s]+$/, '');
  return `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;
};

/** What the teacher said → journal entries, without any AI. They go through the same checks as the AI's. */
export function keywordEntries(transcript: string, students: RosterEntry[]): ReportEntry[] {
  const sentences = String(transcript)
    .split(/[.!?\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences
    .flatMap((sentence) => cut(sentence, students))
    .map((part) => {
      const text = ` ${normalize(part)} `;
      const has = (keyword: string) => text.includes(` ${keyword} `);
      const section: SectionKey =
        (has('nhắn') || has('nhờ') ? 'note' : null) ??
        (Object.keys(SECTION_KEYWORDS) as (keyof typeof SECTION_KEYWORDS)[]).find((k) =>
          SECTION_KEYWORDS[k].some(has),
        ) ??
        'note';
      const mentions = findSpokenNames(part, students).map((spoken) => ({
        spoken,
        studentId: matchStudentName(spoken, students).studentId,
      }));
      const status: EntryStatus = mentions.length
        ? 'named'
        : /(^| )không (bạn|bé|con|ai) nào /.test(text)
          ? 'nobody'
          : has('cả lớp') || has('các con')
            ? 'all'
            : 'part';
      return { section, status, text: capitalise(part), mentions };
    });
}

/**
 * The keyword engine: used when no AI provider is configured, and for the automated tests (AI_MODE=mock). A name it
 * cannot verify is held for the teacher by the review, exactly as with the AI.
 */
@Injectable()
export class RuleBasedJournalExtractor implements JournalExtractor {
  readonly name = 'keywords';

  extract(transcript: string, roster: RosterEntry[]): Promise<ExtractedReport> {
    return Promise.resolve({ entries: keywordEntries(transcript, roster), reported: [] });
  }
}
