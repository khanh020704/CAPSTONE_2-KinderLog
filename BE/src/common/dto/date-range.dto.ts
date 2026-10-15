import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class DateRangeQueryDto {
  /** YYYY-MM-DD, defaults to 6 days before `to` */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** YYYY-MM-DD, defaults to today */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  /** SYSTEM_ADMIN only: which school to report on */
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}
