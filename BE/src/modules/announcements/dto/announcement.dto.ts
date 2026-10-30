import { PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { AnnouncementAudience, AnnouncementCategory, AnnouncementStatus } from '../../../common/enums';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content: string;

  @IsOptional()
  @IsEnum(AnnouncementCategory)
  category?: AnnouncementCategory;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  /** PUBLISHED notifies the audience right away (or on the publish date). Default DRAFT. */
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  /** YYYY-MM-DD, today or later (default today): readers see it, and are notified, from 00:00 that day. */
  @IsOptional()
  @IsDateString({ strict: true })
  publishOn?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString({ strict: true })
  expiresOn?: string | null;

  /** SYSTEM_ADMIN only */
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export class ListAnnouncementsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @IsOptional()
  @IsEnum(AnnouncementCategory)
  category?: AnnouncementCategory;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  /** Title contains */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** SYSTEM_ADMIN only */
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}
