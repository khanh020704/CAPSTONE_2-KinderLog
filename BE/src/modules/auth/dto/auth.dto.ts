import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { UserRole } from '../../../common/enums';

export class LoginDto {
  /** 10-digit Vietnamese mobile number, e.g. 0903000001 */
  @Matches(/^0\d{9}$/, { message: 'phone must be a 10-digit number starting with 0' })
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;

  /** Optional: the role picked on the FE login screen; rejects the login when it does not match. */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
