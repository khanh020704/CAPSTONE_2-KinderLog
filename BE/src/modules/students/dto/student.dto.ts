import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Gender, RecordStatus, Relationship } from '../../../common/enums';

export class CreateStudentDto {
  @IsUUID()
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
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

export class LinkParentDto {
  @IsUUID()
  parentId: string;

  @IsEnum(Relationship)
  relationship: Relationship;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
