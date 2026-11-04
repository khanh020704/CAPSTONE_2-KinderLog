import { PartialType } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { RecordStatus } from '../../../common/enums';

export class CreateSchoolDto {
  @IsString()
  @Length(2, 150)
  name: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  address?: string;

  @IsOptional()
  @Matches(/^0\d{9,10}$/, { message: 'phone must be 10–11 digits starting with 0' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateSchoolDto extends PartialType(CreateSchoolDto) {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
