import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const MAX_TEXT = 2000;

// Files a journal may point at: those uploaded through the API, nothing from elsewhere (parents' pages show them).
const PHOTO_PATH = /^\/uploads\/photos\/[\w.-]+$/;
const AUDIO_PATH = /^\/uploads\/audio\/[\w.-]+$/;
const UPLOADED = { message: 'Use a file uploaded through KinderLog.' };

/** The six sections; a missing one is saved empty. */
export class SectionsDto {
  @IsOptional() @IsString() @MaxLength(MAX_TEXT) meal?: string;
  @IsOptional() @IsString() @MaxLength(MAX_TEXT) learning?: string;
  @IsOptional() @IsString() @MaxLength(MAX_TEXT) sleep?: string;
  @IsOptional() @IsString() @MaxLength(MAX_TEXT) health?: string;
  @IsOptional() @IsString() @MaxLength(MAX_TEXT) emotion?: string;
  @IsOptional() @IsString() @MaxLength(MAX_TEXT) note?: string;
}

// `@Type(() => Object)` on the issue lists: without it implicit conversion turns each item into an empty array.

/** Shared by create, update and "record more": the journal's content. */
class JournalContentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SectionsDto)
  sections?: SectionsDto;

  /** studentId → that child's note. Checked in the service (children of the class, length). */
  @IsOptional()
  @IsObject()
  personal?: Record<string, string>;
}

export class JournalListQueryDto {
  @IsUUID()
  classId: string;

  /** review = waiting for approval or approved but not yet published. */
  @IsOptional()
  @IsIn(['draft', 'review', 'published'])
  status?: 'draft' | 'review' | 'published';

  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}

export class CreateClassJournalDto extends JournalContentDto {
  @IsUUID()
  classId: string;

  /** YYYY-MM-DD, defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @IsOptional()
  @IsIn(['manual', 'voice'])
  source?: 'manual' | 'voice';

  /** Voice: what the teacher said, the recordings, and the points of the draft to confirm. */
  @IsOptional() @IsString() @MaxLength(50_000) transcript?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(AUDIO_PATH, { each: true, ...UPLOADED })
  audio?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Object) issues?: unknown[];
}

export class UpdateClassJournalDto extends JournalContentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @Matches(PHOTO_PATH, { each: true, ...UPLOADED })
  photos?: string[];

  /** The teacher's decisions: [{ id, status, resolution, assignedTo }]. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Object) issues?: unknown[];
}

/** Another recording added to the draft (POST /class-journals/:id/recordings). */
export class AddRecordingDto extends JournalContentDto {
  @IsOptional() @IsString() @MaxLength(50_000) transcript?: string;
  @IsOptional() @IsString() @MaxLength(500) @Matches(AUDIO_PATH, UPLOADED) audioUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Object) issues?: unknown[];
}

/** multipart/form-data: the `audio` file, and the browser's own transcript as a fallback. */
export class TranscribeDto {
  @IsUUID()
  classId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  transcript?: string;
}

/** The text the teacher checked → a draft. Nothing is saved. */
export class VoiceDraftDto {
  @IsUUID()
  classId: string;

  @IsString()
  @MaxLength(20_000)
  transcript: string;

  /** The recording sent before to /class-journals/transcribe. */
  @IsOptional() @IsString() @MaxLength(500) @Matches(AUDIO_PATH, UPLOADED) audioUrl?: string;

  /** A further recording is checked against what this journal already says. */
  @IsOptional() @IsUUID() journalId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}
