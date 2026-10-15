import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AttendanceStatus,
  HealthStatus,
  JournalSource,
  MealLevel,
  Mood,
  SleepQuality,
} from '../../../common/enums';

/** Every field a journal entry can carry. All optional: a bulk default or exception sets only what it names. */
export class JournalFieldsDto {
  @IsOptional() @IsEnum(AttendanceStatus) attendance?: AttendanceStatus;
  @IsOptional() @IsString() @Length(0, 255) absenceReason?: string | null;

  @IsOptional() @IsEnum(MealLevel) mealLevel?: MealLevel | null;
  @IsOptional() @IsString() mealNote?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(300) sleepMinutes?: number | null;
  @IsOptional() @IsEnum(SleepQuality) sleepQuality?: SleepQuality | null;

  @IsOptional() @IsString() learningNote?: string | null;

  @IsOptional() @IsEnum(HealthStatus) healthStatus?: HealthStatus | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(34) @Max(42) temperature?: number | null;
  @IsOptional() @IsString() healthNote?: string | null;

  @IsOptional() @IsEnum(Mood) mood?: Mood | null;
  @IsOptional() @IsString() teacherNote?: string | null;
}

export class JournalExceptionDto extends JournalFieldsDto {
  @IsUUID()
  studentId: string;
}

/**
 * Bulk logging: `defaults` is applied to every active child of the class, then each entry in `exceptions`
 * overrides only the fields it sets for that one child (e.g. "cả lớp ăn hết, riêng bé An ăn ít").
 */
export class BulkJournalDto {
  @IsUUID()
  classId: string;

  /** YYYY-MM-DD, defaults to today */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @ValidateNested()
  @Type(() => JournalFieldsDto)
  defaults: JournalFieldsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => JournalExceptionDto)
  exceptions?: JournalExceptionDto[];

  /** VOICE when the teacher saves a reviewed AI draft; defaults to BULK. */
  @IsOptional()
  @IsEnum(JournalSource)
  source?: JournalSource;
}

export class HistoryQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class UpsertJournalDto extends JournalFieldsDto {
  /** YYYY-MM-DD, defaults to today */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}

export class ApproveJournalsDto {
  @IsUUID()
  classId: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  /** Approve only these children; omitted = every DRAFT entry of the class for that day. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  studentIds?: string[];
}

export class ClassDayQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}

export class TimelineQueryDto {
  @IsUUID()
  studentId: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';
const toIdList = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value
    : typeof value === 'string' && value
      ? value.split(',').map((s) => s.trim())
      : undefined;

/** multipart/form-data fields for photo upload; the images go in the `photos` file field. */
export class UploadPhotosDto {
  @IsUUID()
  classId: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  /** Children in the photos (comma-separated or repeated). Omitted = every child present that day. */
  @IsOptional()
  @Transform(toIdList)
  @IsUUID('all', { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 255)
  caption?: string;
}

/** Voice → JSON. multipart/form-data fields; the recording goes in the `audio` file field. */
export class VoiceJournalDto {
  @IsUUID()
  classId: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  /** true = save the AI result straight away as DRAFT entries (the teacher still has to approve). */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  apply?: boolean;
}

/** Text → JSON, for when speech-to-text already ran in the browser (the FE uses the Web Speech API). */
export class TextJournalDto extends VoiceJournalDto {
  @IsString()
  @Length(3, 20_000)
  transcript: string;
}
