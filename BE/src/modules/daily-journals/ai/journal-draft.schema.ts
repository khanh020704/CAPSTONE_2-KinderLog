import * as z from 'zod/v4';
import { AttendanceStatus, HealthStatus, MealLevel, Mood, SleepQuality } from '../../../common/enums';

/**
 * The JSON contract between the LLM and the bulk-logging service. Every field is required-but-nullable
 * (null = "the teacher did not mention it"), which keeps the schema strict for structured outputs.
 */
const fields = {
  attendance: z
    .enum(AttendanceStatus)
    .nullable()
    .describe('ABSENT only if the teacher says the child is away today'),
  absenceReason: z.string().nullable(),
  mealLevel: z
    .enum(MealLevel)
    .nullable()
    .describe('ALL=ăn hết, MOST=gần hết, HALF=một nửa, LITTLE=ăn ít, NONE=không ăn'),
  mealNote: z.string().nullable().describe('Dishes and eating details, in Vietnamese'),
  sleepMinutes: z.number().int().nullable().describe('Nap length in minutes, e.g. "1 tiếng rưỡi" = 90'),
  sleepQuality: z.enum(SleepQuality).nullable(),
  learningNote: z.string().nullable().describe('Learning / play activities, in Vietnamese'),
  healthStatus: z.enum(HealthStatus).nullable(),
  temperature: z.number().nullable().describe('Body temperature in °C if stated, e.g. 37.8'),
  healthNote: z.string().nullable(),
  mood: z.enum(Mood).nullable(),
  teacherNote: z.string().nullable().describe('Anything else worth telling the parents, in Vietnamese'),
};

export const JournalPatchSchema = z.object(fields);

/** Built per request so `studentId` is constrained to the real roster of the class. */
export function buildDraftSchema(studentIds: [string, ...string[]]) {
  return z.object({
    classDefaults: JournalPatchSchema.describe('What applies to the whole class'),
    exceptions: z
      .array(z.object({ studentId: z.enum(studentIds), ...fields }))
      .describe('Only children the teacher singled out, with only the fields that differ from the class'),
    unrecognizedNames: z.array(z.string()).describe('Child names mentioned that are not in the roster'),
  });
}

export type JournalPatch = z.infer<typeof JournalPatchSchema>;
export type JournalDraft = ReturnType<typeof buildDraftSchema>['_output'];

export interface RosterEntry {
  id: string;
  fullName: string;
}

export interface JournalExtractor {
  readonly name: string;
  extract(transcript: string, roster: RosterEntry[]): Promise<JournalDraft>;
}

export const JOURNAL_EXTRACTOR = Symbol('JOURNAL_EXTRACTOR');
