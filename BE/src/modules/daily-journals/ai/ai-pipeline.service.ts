import { BadGatewayException, BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { AuthUser } from '../../../common/decorators';
import { AttendanceStatus } from '../../../common/enums';
import { AccessService } from '../../access/access.service';
import { ClassJournalsService } from '../class-journals.service';
import { DailyJournalsService } from '../daily-journals.service';
import { TranscribeDto, VoiceDraftDto } from '../dto/class-journal.dto';
import { assertSpeechToText } from './ai-readiness';
import { JOURNAL_EXTRACTOR, JournalExtractor, RosterEntry } from './journal-draft.schema';
import { assembleDraft, DayAttendance, ExistingContent, reviewDraft } from './journal-review';
import { SpeechToTextService } from './speech-to-text.service';

export const AUDIO_PUBLIC_PATH = '/uploads/audio';

/**
 * Voice → speech-to-text → (the teacher reads and corrects the text) → entries (LLM or keyword rules) → checked in
 * code → the two layers of a class journal. Nothing is saved here: the teacher reviews the draft, and only an
 * approved journal is ever published.
 */
@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger(AiPipelineService.name);
  private readonly uploadDir: string;

  constructor(
    private readonly stt: SpeechToTextService,
    @Inject(JOURNAL_EXTRACTOR) private readonly extractor: JournalExtractor,
    private readonly classJournals: ClassJournalsService,
    private readonly journals: DailyJournalsService,
    private readonly access: AccessService,
    private readonly config: ConfigService,
  ) {
    this.uploadDir = config.get<string>('uploadDir')!;
  }

  /**
   * Step 1 on its own: the recording → text, which the teacher reads and corrects before the draft is made. The
   * recording is kept (for listening back in the journal). Whisper knows the children's names; the browser's own
   * text is the fallback when Whisper is not set up or fails.
   */
  async transcribe(user: AuthUser, dto: TranscribeDto, audio?: Express.Multer.File) {
    const roster = await this.roster(user, dto.classId);
    const fallback = dto.transcript?.trim();
    const audioUrl = audio?.buffer?.length ? await this.keep(audio) : null;
    const browser = () => ({
      transcript: fallback!,
      transcriptSource: 'browser',
      engine: 'browser',
      audioUrl,
    });

    if (!audioUrl) {
      if (fallback) return browser();
      throw new BadRequestException('Attach the recording in the "audio" field');
    }
    if (!this.stt.available) {
      if (fallback) return browser();
      assertSpeechToText(this.config);
    }
    try {
      const heard = await this.stt.transcribe(audio!, roster);
      return { transcript: heard.text, transcriptSource: 'whisper', engine: heard.engine, audioUrl };
    } catch (err) {
      if (fallback) {
        this.logger.warn(`Whisper failed, using the browser transcript: ${(err as Error).message}`);
        return browser();
      }
      throw err;
    }
  }

  /** The text the teacher confirmed → a draft: { sections, personal, issues }. */
  async voiceDraft(user: AuthUser, dto: VoiceDraftDto) {
    const students = await this.roster(user, dto.classId);
    const transcript = dto.transcript.trim();
    if (!transcript) {
      throw new BadRequestException(
        "We couldn't process the recording. No speech was detected. Please try again.",
      );
    }
    // A further recording is checked against what the journal already says, and every one against the attendance.
    let existing: ExistingContent | undefined;
    let date = dto.date ?? this.journals.today();
    if (dto.journalId) {
      const found = await this.classJournals.existing(user, dto.classId, dto.journalId);
      existing = { sections: found.sections, personal: found.personal };
      date = found.date;
    }
    const attendance = await this.dayAttendance(dto.classId, date);

    const started = Date.now();
    const { entries, reported } = await this.extractor.extract(transcript, students);
    const reviewed = reviewDraft({ entries, students, transcript, reported, existing, attendance });
    const { sections, personal } = assembleDraft(reviewed.entries, students);
    return {
      transcript,
      sections,
      personal,
      issues: reviewed.issues,
      audioUrl: dto.audioUrl ?? null,
      engine: this.extractor.name,
      processingMs: Date.now() - started,
    };
  }

  private async dayAttendance(classId: string, date: string): Promise<DayAttendance> {
    const saved = await this.journals.savedAttendance(classId, date);
    const out: DayAttendance = {};
    for (const [id, a] of saved) {
      out[id] = {
        status: a.attendance === AttendanceStatus.ABSENT ? 'absent' : 'present',
        note: a.absenceReason ?? '',
      };
    }
    return out;
  }

  private async keep(audio: Express.Multer.File) {
    const ext = audio.mimetype.includes('ogg') ? '.ogg' : audio.mimetype.includes('mp4') ? '.m4a' : '.webm';
    const name = `${randomUUID()}${ext}`;
    try {
      await fs.mkdir(join(this.uploadDir, 'audio'), { recursive: true });
      await fs.writeFile(join(this.uploadDir, 'audio', name), audio.buffer);
    } catch (err) {
      this.logger.error(`Could not store the recording: ${(err as Error).message}`);
      throw new BadGatewayException('The recording could not be stored. Please try again.');
    }
    return `${AUDIO_PUBLIC_PATH}/${name}`;
  }

  private async roster(user: AuthUser, classId: string): Promise<RosterEntry[]> {
    await this.access.assertClassWritable(user, classId);
    const students = await this.journals.activeStudents(classId);
    if (!students.length) throw new BadRequestException('This class has no active students');
    return students.map((s) => ({ id: s.id, fullName: s.fullName }));
  }
}
