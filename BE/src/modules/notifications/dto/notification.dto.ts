import {
  ArrayMaxSize,
  IsArray,
  IsBooleanString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { NotificationType, UserRole } from '../../../common/enums';
import { IsGuid } from '../../../common/validators/guid';

export class ListNotificationsQueryDto extends PageQueryDto {
  /** "true" → unread only */
  @IsOptional()
  @IsBooleanString()
  unread?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

/** Principal / admin: a notification to chosen accounts, or to every active account of a role in the school. */
export class SendNotificationDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsGuid({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  link?: string;

  /** SYSTEM_ADMIN only, with `role` */
  @IsOptional()
  @IsGuid()
  schoolId?: string;
}
