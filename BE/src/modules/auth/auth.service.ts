import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../system/settings.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';

/** Consecutive failed sign-ins before a phone number is blocked, and for how long (User Story 2.1). */
const MAX_FAILED_LOGINS = Number(process.env.LOGIN_MAX_FAILED ?? 5);
const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MINUTES ?? 10) * 60_000;

@Injectable()
export class AuthService {
  /** phone → consecutive failures and, once blocked, until when. Kept in memory: a restart clears it. */
  private readonly failures = new Map<string, { count: number; until?: number }>();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async login(dto: LoginDto) {
    const phone = dto.phone.trim();
    const blocked = this.failures.get(phone)?.until;
    if (blocked && blocked > Date.now()) {
      const minutes = Math.ceil((blocked - Date.now()) / 60_000);
      throw new HttpException(
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.school', 'school')
      .where('u.phone = :phone', { phone })
      .getOne();

    // Same message for "no such phone" and "wrong password" so accounts cannot be enumerated.
    const invalid = new UnauthorizedException('Incorrect phone number or password');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      this.recordFailure(phone);
      throw invalid;
    }
    this.failures.delete(phone);
    if (dto.role && dto.role !== user.role) throw invalid;
    if (user.status !== RecordStatus.ACTIVE) {
      throw new ForbiddenException(
        `This account is ${user.status.toLowerCase()}. Please contact your school.`,
      );
    }
    if (user.school && user.school.status !== RecordStatus.ACTIVE) {
      throw new ForbiddenException('Your school is not active on the platform.');
    }

    await this.users.update(user.id, { lastLoginAt: new Date() });
    const payload: JwtPayload = { sub: user.id, role: user.role, schoolId: user.schoolId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('jwt.expiresIn'),
      user: await this.usersService.profile(user.id),
    };
  }

  private recordFailure(phone: string) {
    const prev = this.failures.get(phone);
    const count = (prev?.until && prev.until <= Date.now() ? 0 : (prev?.count ?? 0)) + 1;
    this.failures.set(phone, {
      count,
      until: count >= MAX_FAILED_LOGINS ? Date.now() + LOGIN_LOCK_MS : undefined,
    });
  }

  me(user: AuthUser) {
    return this.usersService.profile(user.id);
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const rec = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: user.id })
      .getOneOrFail();
    if (!(await bcrypt.compare(dto.currentPassword, rec.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    const { passwordMin } = await this.settings.get();
    if (dto.newPassword.length < passwordMin) {
      throw new BadRequestException(`The new password must be at least ${passwordMin} characters long`);
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('The new password must be different from the current one');
    }
    await this.users.update(user.id, { passwordHash: await this.usersService.hash(dto.newPassword) });
    return { success: true };
  }
}
