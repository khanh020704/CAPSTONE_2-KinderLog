import { PartialType, PickType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RecordStatus, UserRole } from '../../../common/enums';
import { IsGuid } from '../../../common/validators/guid';

export class CreateUserDto {
  @IsString()
  @Length(2, 120)
  fullName: string;

  @Matches(/^0\d{9}$/, { message: 'phone must be a 10-digit number starting with 0' })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(UserRole)
  role: UserRole;

  /** Required when a SYSTEM_ADMIN creates a principal; principals always create users in their own school. */
  @IsOptional()
  @IsGuid()
  schoolId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  address?: string;

  /** Parents: classroom camera allowed during its scheduled times (default true). */
  @IsOptional()
  @IsBoolean()
  cameraAccess?: boolean;

  /** Defaults to DEFAULT_PASSWORD (the FE shows it as the initial password). */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class UpdateUserDto extends PartialType(
  PickType(CreateUserDto, ['fullName', 'phone', 'email', 'address', 'schoolId', 'cameraAccess'] as const),
) {}

export class UpdateProfileDto extends PartialType(
  PickType(CreateUserDto, ['fullName', 'email', 'address'] as const),
) {}

export class UpdateStatusDto {
  @IsEnum(RecordStatus)
  status: RecordStatus;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsGuid()
  schoolId?: string;

  /** Matches name, phone or email */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
