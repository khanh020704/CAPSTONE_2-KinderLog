import { IsBoolean, IsEmail, IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';

/** Each parameter has a type and a valid range; values outside it are rejected (User Story 2.4). */
export class SettingsDto {
  @IsString()
  @Length(1, 80)
  platformName: string;

  @IsEmail()
  supportEmail: string;

  /** Minutes of inactivity before signing out */
  @IsInt()
  @Min(5)
  @Max(1440)
  sessionTimeout: number;

  /** Shortest password accepted when a user changes theirs */
  @IsInt()
  @Min(6)
  @Max(64)
  passwordMin: number;

  @IsIn(['Vietnamese'])
  sttLanguage: string;

  /** Photos a class journal may hold (User Story 2.16: up to 10) */
  @IsInt()
  @Min(1)
  @Max(10)
  maxPhotos: number;

  @IsBoolean()
  aiJournal: boolean;
}

export const DEFAULT_SETTINGS: SettingsDto = {
  platformName: 'KinderLog',
  supportEmail: 'hotro@kinderlog.vn',
  sessionTimeout: 60,
  passwordMin: 6,
  sttLanguage: 'Vietnamese',
  maxPhotos: 6,
  aiJournal: true,
};
