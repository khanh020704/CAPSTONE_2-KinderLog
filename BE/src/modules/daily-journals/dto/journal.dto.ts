import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AbsenceType,
  AttendanceStatus,
  HealthStatus,
  JournalSource,
  MealLevel,
  Mood,
  SleepQuality,
} from '../../../common/enums';
import { IsGuid } from '../../../common/validators/guid';

/**
 * Every field a journal entry can carry. All optional: a bulk default or exception sets only what it names.
 * Notes are limited to 500 characters (User Story 2.13).
 */
export class JournalFieldsDto {
  @IsOptional() @IsEnum(AttendanceStatus) attendance?: AttendanceStatus;
  /** With ABSENT: EXCUSED or UNEXCUSED (default UNEXCUSED). Ignored for a present child. */
  @IsOptional() @IsEnum(AbsenceType) absenceType?: AbsenceType | null;
  @IsOptional() @IsString() @Length(0, 255) absenceReason?: string | null;

  @IsOptional() @IsEnum(MealLevel) mealLevel?: MealLevel | null;
  @IsOptional() @IsString() @MaxLength(500) mealNote?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(300) sleepMinutes?: number | null;
  @IsOptional() @IsEnum(SleepQuality) sleepQuality?: SleepQuality | null;

  @IsOptional() @IsString() @MaxLength(500) learningNote?: string | null;

  @IsOptional() @IsEnum(HealthStatus) healthStatus?: HealthStatus | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(34) @Max(42) temperature?: number | null;
  @IsOptional() @IsString() @MaxLength(500) healthNote?: string | null;

  @IsOptional() @IsEnum(Mood) mood?: Mood | null;
  @IsOptional() @IsString() @MaxLength(500) teacherNote?: string | null;
}

export class JournalExceptionDto extends JournalFieldsDto {
  @IsGuid()
  studentId: string;
}

/**
 * Bulk logging: `defaults` is applied to every active child of the class, then each entry in `exceptions`
 * overrides only the fields it sets for that one child (e.g. "cả lớp ăn hết, riêng bé An ăn ít").
 */
export class BulkJournalDto {
  @IsGuid()
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

export class UpsertJournalDto extends JournalFieldsDto {
  /** YYYY-MM-DD, defaults to today */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}

export class ClassDayQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}

export class TimelineQueryDto {
  @IsGuid()
  studentId: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class AttendanceQueryDto {
  @IsGuid()
  studentId: string;

  /** YYYY-MM-DD, defaults to today */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}
