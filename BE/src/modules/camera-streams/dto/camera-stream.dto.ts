import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  isURL,
  Length,
  Matches,
  Max,
  Min,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';
import { IsGuid } from '../../../common/validators/guid';

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * peer://[code]: a live WebRTC camera published through PeerJS (camera.html / viewer.html codes).
 * Plain "peer://" uses the camera's own id as its code (see streamUrlOf); a code may be up to 64 characters.
 */
const PEER_STREAM = /^peer:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)?$/;

/** An http(s) HLS / MP4 URL, or peer://[code]. */
const IsStreamUrl = (options?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isStreamUrl',
      validator: {
        validate: (v: unknown) =>
          typeof v === 'string' &&
          (PEER_STREAM.test(v) || isURL(v, { require_tld: false, protocols: ['http', 'https'] })),
        defaultMessage: () =>
          'streamUrl must be an http(s) URL (HLS .m3u8 or MP4), peer:// (the camera id is the code) or peer://<code> (lowercase letters, digits, -)',
      },
    },
    options,
  );

export class CreateCameraStreamDto {
  @IsGuid()
  classId: string;

  @IsString()
  @Length(1, 80)
  name: string;

  /** HLS (.m3u8) / MP4 URL, or a PeerJS camera: peer:// (code = this camera's id) or peer://<code> */
  @IsStreamUrl()
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
  @IsGuid()
  classId?: string;
}

export class WatchQueryDto {
  /** Parent: which child. Staff can use ?classId instead. */
  @IsOptional()
  @IsGuid()
  studentId?: string;

  @IsOptional()
  @IsGuid()
  classId?: string;
}
