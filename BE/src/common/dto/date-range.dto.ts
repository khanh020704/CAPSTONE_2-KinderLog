import { IsDateString, IsOptional } from 'class-validator';
import { IsGuid } from '../validators/guid';

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
  @IsGuid()
  classId?: string;

  /** SYSTEM_ADMIN only: which school to report on */
  @IsOptional()
  @IsGuid()
  schoolId?: string;
}
