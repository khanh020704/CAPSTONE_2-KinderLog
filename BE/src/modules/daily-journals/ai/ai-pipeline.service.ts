import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/decorators';
import { JournalSource } from '../../../common/enums';
import { AccessService } from '../../access/access.service';
import { DailyJournalsService } from '../daily-journals.service';
import { JournalExceptionDto, JournalFieldsDto, TextJournalDto, VoiceJournalDto } from '../dto/journal.dto';
import {
  JOURNAL_EXTRACTOR,
  JournalDraft,
  JournalExtractor,
  JournalPatch,
  RosterEntry,
} from './journal-draft.schema';
import { SpeechToTextService } from './speech-to-text.service';

/** null in the AI contract means "not mentioned" → undefined so bulk logging leaves the field untouched. */
const toFields = (p: Partial<JournalPatch>): JournalFieldsDto =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null));

/**
 * Voice → Whisper ASR → LLM structured extraction → (optional) bulk upsert as DRAFT.
 * The AI never approves anything: the teacher reviews the draft and approves it in the normal flow.
 */
@Injectable()
export class AiPipelineService {
  constructor(
    private readonly stt: SpeechToTextService,
    @Inject(JOURNAL_EXTRACTOR) private readonly extractor: JournalExtractor,
    private readonly journals: DailyJournalsService,
    private readonly access: AccessService,
  ) {}

  async fromAudio(user: AuthUser, dto: VoiceJournalDto, audio?: Express.Multer.File) {
    if (!audio?.buffer?.length) throw new BadRequestException('Attach the recording in the "audio" field');
    const roster = await this.roster(user, dto.classId);
    const started = Date.now();
    const transcription = await this.stt.transcribe(audio, roster);
    const asrMs = Date.now() - started;
    return this.run(user, dto, transcription.text, roster, { asr: transcription.engine, asrMs });
  }

  async fromText(user: AuthUser, dto: TextJournalDto) {
    const roster = await this.roster(user, dto.classId);
    return this.run(user, dto, dto.transcript, roster, { asr: 'client', asrMs: 0 });
  }

  private async run(
    user: AuthUser,
    dto: VoiceJournalDto,
    transcript: string,
    roster: RosterEntry[],
    meta: { asr: string; asrMs: number },
  ) {
    const started = Date.now();
    const draft = await this.extractor.extract(transcript, roster);
    const validIds = new Set(roster.map((s) => s.id));
    const names = new Map(roster.map((s) => [s.id, s.fullName]));

    const defaults = toFields(draft.classDefaults);
    const exceptions: JournalExceptionDto[] = draft.exceptions
      .filter((e) => validIds.has(e.studentId))
      .map(({ studentId, ...patch }) => ({ studentId, ...toFields(patch) }));

    const result = {
      transcript,
      pipeline: {
        asr: meta.asr,
        extractor: this.extractor.name,
        asrMs: meta.asrMs,
        extractMs: Date.now() - started,
      },
      draft: {
        classDefaults: defaults,
        exceptions: exceptions.map((e) => ({ ...e, studentName: names.get(e.studentId) })),
        unrecognizedNames: draft.unrecognizedNames,
      } satisfies Record<keyof JournalDraft, unknown>,
      applied: null as Awaited<ReturnType<DailyJournalsService['bulkUpsert']>> | null,
    };

    if (dto.apply) {
      result.applied = await this.journals.bulkUpsert(
        user,
        { classId: dto.classId, date: dto.date, defaults, exceptions },
        JournalSource.VOICE,
      );
    }
    return result;
  }

  private async roster(user: AuthUser, classId: string): Promise<RosterEntry[]> {
    await this.access.assertClassWritable(user, classId);
    const students = await this.journals.activeStudents(classId);
    if (!students.length) throw new BadRequestException('This class has no active students');
    return students.map((s) => ({ id: s.id, fullName: s.fullName }));
  }
}
