import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { RecordStatus } from '../../../common/enums';
import { IsGuid } from '../../../common/validators/guid';

export class CreateClassDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @Matches(/^\d{4}-\d{4}$/, { message: 'academicYear must look like 2026-2027' })
  academicYear: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  ageGroup?: string;

  /** A TEACHER of the same school, or null to leave the class without a homeroom teacher. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsGuid()
  homeroomTeacherId?: string | null;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class ListClassesQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{4}$/)
  academicYear?: string;

  @IsOptional()
  @IsGuid()
  schoolId?: string;
}
