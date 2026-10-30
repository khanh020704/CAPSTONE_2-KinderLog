import { PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { AcademicYearStatus } from '../../../common/enums';

export class CreateAcademicYearDto {
  /** Same format as classes.academicYear */
  @Matches(/^\d{4}-\d{4}$/, { message: 'name must look like 2026-2027' })
  name: string;

  @IsDateString({ strict: true })
  startDate: string;

  @IsDateString({ strict: true })
  endDate: string;

  /** ACTIVE makes it the current year (the previous current year becomes INACTIVE). Default INACTIVE. */
  @IsOptional()
  @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;

  /** SYSTEM_ADMIN only */
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}

export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

export class ListAcademicYearsQueryDto {
  @IsOptional()
  @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;

  /** SYSTEM_ADMIN only */
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}
