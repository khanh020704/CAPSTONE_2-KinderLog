import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Gender, RecordStatus, Relationship } from '../../../common/enums';
import { IsGuid } from '../../../common/validators/guid';

export class CreateStudentDto {
  @IsGuid()
  classId: string;

  @IsString()
  @Length(2, 120)
  fullName: string;

  @IsDateString({ strict: true })
  dateOfBirth: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  medicalNote?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class ListStudentsQueryDto {
  @IsOptional()
  @IsGuid()
  classId?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class LinkParentDto {
  @IsGuid()
  parentId: string;

  @IsEnum(Relationship)
  relationship: Relationship;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  /** ACTIVE (default) or INACTIVE: an inactive link hides the child from the parent. */
  @IsOptional()
  @IsIn([RecordStatus.ACTIVE, RecordStatus.INACTIVE])
  status?: RecordStatus;
}
