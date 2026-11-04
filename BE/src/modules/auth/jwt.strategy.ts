import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus, UserRole } from '../../common/enums';
import { User } from '../users/entities/user.entity';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  schoolId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
    });
  }

  /**
   * Re-reads the account (and its school) so a locked / deactivated user — or every user of a locked / deactivated
   * school — is cut off immediately, not when the token expires.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findOne({ where: { id: payload.sub }, relations: { school: true } });
    if (!user || user.status !== RecordStatus.ACTIVE)
      throw new UnauthorizedException('Account is not active');
    if (user.school && user.school.status !== RecordStatus.ACTIVE)
      throw new UnauthorizedException('Your school is not active on the platform');
    return { id: user.id, role: user.role, schoolId: user.schoolId, fullName: user.fullName };
  }
}
