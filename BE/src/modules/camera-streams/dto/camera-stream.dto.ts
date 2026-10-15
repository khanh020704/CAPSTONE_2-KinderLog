import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateCameraStreamDto {
  @IsUUID()
  classId: string;

  @IsString()
  @Length(1, 80)
  name: string;

  /** HLS (.m3u8) or MP4 URL of the demo feed */
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  streamUrl: string;

  /** HH:mm in the school's timezone */
  @Matches(TIME, { message: 'allowedStartTime must be HH:mm' })
  allowedStartTime: string;

  @Matches(TIME, { message: 'allowedEndTime must be HH:mm' })
  allowedEndTime: string;

  /** ISO weekday bitmask: Monday = 2, Tuesday = 4 … Sunday = 128. Default 62 = Monday–Friday. */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(254)
  allowedWeekdays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCameraStreamDto extends PartialType(CreateCameraStreamDto) {}

export class ListCameraStreamsQueryDto {
  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class WatchQueryDto {
  /** Parent: which child. Staff can use ?classId instead. */
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}
