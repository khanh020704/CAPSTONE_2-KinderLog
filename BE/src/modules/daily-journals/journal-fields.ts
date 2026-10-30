import { AttendanceStatus, HealthStatus } from '../../common/enums';
import { JournalFieldsDto } from './dto/journal.dto';
import { DailyJournal } from './entities/daily-journal.entity';

export const JOURNAL_FIELDS = [
  'attendance',
  'absenceReason',
  'mealLevel',
  'mealNote',
  'sleepMinutes',
  'sleepQuality',
  'learningNote',
  'healthStatus',
  'temperature',
  'healthNote',
  'mood',
  'teacherNote',
] as const satisfies readonly (keyof JournalFieldsDto & keyof DailyJournal)[];

export type JournalFields = Pick<DailyJournal, (typeof JOURNAL_FIELDS)[number]>;

/** Fields that only make sense when the child was at school. */
const IN_CLASS_FIELDS = [
  'mealLevel',
  'mealNote',
  'sleepMinutes',
  'sleepQuality',
  'learningNote',
  'mood',
] as const;

export const FEVER_THRESHOLD = 37.5;

/** Keep only the fields that were actually sent (undefined = "not mentioned", null = "clear it"). */
export function pickFields(src: Partial<JournalFieldsDto> | undefined): Partial<JournalFields> {
  const out: Partial<Record<string, unknown>> = {};
  if (!src) return out;
  for (const k of JOURNAL_FIELDS) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/**
 * Business rules applied after merging, so bulk, single edits and AI drafts all behave the same:
 *  - an absent child has no meal / sleep / learning / mood data;
 *  - a child who was absent and is now present loses the old reason (`cameBack`), unless a new note is given;
 *    otherwise a present child may keep a note in absenceReason (e.g. "arrived late");
 *  - a fever reading without an explicit health status marks the child for monitoring.
 * Returns human-readable warnings for the teacher.
 */
export function normalize(entry: JournalFields, allergies?: string | null, cameBack = false): string[] {
  const warnings: string[] = [];
  if (entry.attendance === AttendanceStatus.ABSENT) {
    for (const k of IN_CLASS_FIELDS) (entry as Record<string, unknown>)[k] = null;
    // The teacher did not see an absent child: "Normal" (usually inherited from the class) says nothing.
    // MONITOR / SICK stay, since illness is often the reason for the absence.
    if (entry.healthStatus === HealthStatus.NORMAL) entry.healthStatus = null;
  } else if (cameBack) {
    entry.absenceReason = null;
  }
  if (entry.temperature != null && entry.temperature >= FEVER_THRESHOLD) {
    if (!entry.healthStatus || entry.healthStatus === HealthStatus.NORMAL)
      entry.healthStatus = HealthStatus.MONITOR;
    warnings.push(`Temperature ${entry.temperature}°C – please inform the parents`);
  }
  if (allergies && entry.attendance !== AttendanceStatus.ABSENT && entry.mealLevel) {
    warnings.push(`Allergy on file: ${allergies}`);
  }
  return warnings;
}
