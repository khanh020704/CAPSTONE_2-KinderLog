import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.school', 'school')
      .where('u.phone = :phone', { phone: dto.phone.trim() })
      .getOne();

    // Same message for "no such phone" and "wrong password" so accounts cannot be enumerated.
    const invalid = new UnauthorizedException('Incorrect phone number or password');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw invalid;
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
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('The new password must be different from the current one');
    }
    await this.users.update(user.id, { passwordHash: await this.usersService.hash(dto.newPassword) });
    return { success: true };
  }
}
