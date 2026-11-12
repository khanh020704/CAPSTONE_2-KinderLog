import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { AuditAction, AuditStatus, UserRole } from '../../../common/enums';
import { IsGuid } from '../../../common/validators/guid';

export class ListAuditLogsQueryDto extends PageQueryDto {
  /** YYYY-MM-DD (inclusive, APP_TIMEZONE) */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsGuid()
  userId?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  module?: string;

  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  /** Description or actor name contains */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** SYSTEM_ADMIN only */
  @IsOptional()
  @IsGuid()
  schoolId?: string;
}

export class PurgeAuditLogsQueryDto {
  /** Deletes entries older than this day (YYYY-MM-DD). */
  @IsDateString({ strict: true })
  before: string;
}
