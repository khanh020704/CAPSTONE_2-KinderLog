import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { IsGuid } from '../../../common/validators/guid';
import { isUploadedAudio, isUploadedPhoto } from '../../storage/media-storage.service';

export const MAX_TEXT = 2000;

// Files a journal may point at: those uploaded through the API, nothing from elsewhere (parents' pages show them):
// /uploads/<photos|audio>/<file> on disk or the configured ImageKit folder (see isUploaded).
const UPLOADED = { message: 'Use a file uploaded through KinderLog.' };
const UploadedPhoto = (opts?: ValidationOptions) =>
  ValidateBy({ name: 'isUploadedPhoto', validator: { validate: isUploadedPhoto } }, { ...UPLOADED, ...opts });
const UploadedAudio = (opts?: ValidationOptions) =>
  ValidateBy({ name: 'isUploadedAudio', validator: { validate: isUploadedAudio } }, { ...UPLOADED, ...opts });

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
  @IsGuid()
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
  @IsGuid()
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
  @UploadedAudio({ each: true })
  audio?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Object) issues?: unknown[];
}

export class UpdateClassJournalDto extends JournalContentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @UploadedPhoto({ each: true })
  photos?: string[];

  /** The teacher's decisions: [{ id, status, resolution, assignedTo }]. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Object) issues?: unknown[];
}

/** Another recording added to the draft (POST /class-journals/:id/recordings). */
export class AddRecordingDto extends JournalContentDto {
  @IsOptional() @IsString() @MaxLength(50_000) transcript?: string;
  @IsOptional() @IsString() @MaxLength(500) @UploadedAudio() audioUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Object) issues?: unknown[];
}

/** multipart/form-data: the `audio` file, and the browser's own transcript as a fallback. */
export class TranscribeDto {
  @IsGuid()
  classId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  transcript?: string;
}

/** The text the teacher checked → a draft. Nothing is saved. */
export class VoiceDraftDto {
  @IsGuid()
  classId: string;

  @IsString()
  @MaxLength(20_000)
  transcript: string;

  /** The recording sent before to /class-journals/transcribe. */
  @IsOptional() @IsString() @MaxLength(500) @UploadedAudio() audioUrl?: string;

  /** A further recording is checked against what this journal already says. */
  @IsOptional() @IsGuid() journalId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}
