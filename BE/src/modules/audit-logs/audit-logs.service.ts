import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, LessThan, Repository } from 'typeorm';
import { pageWindow, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { addDays } from '../../common/utils/date.util';
import { foldSearch, likeFolded } from '../../common/utils/sql.util';
import { AccessService } from '../access/access.service';
import { ListAuditLogsQueryDto } from './dto/audit-log.dto';
import { AuditLog } from './entities/audit-log.entity';

export type AuditEntry = Pick<AuditLog, 'action' | 'module' | 'description' | 'status'> &
  Partial<Pick<AuditLog, 'userId' | 'schoolId' | 'userName' | 'userRole' | 'httpStatus' | 'ipAddress'>>;

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    private readonly access: AccessService,
  ) {}

  /** Never throws: a failed audit write must not fail the user's request. */
  async record(entry: AuditEntry) {
    try {
      await this.logs.insert({ ...entry, description: entry.description.slice(0, 500) });
    } catch (err) {
      this.logger.warn(`Audit entry not saved: ${(err as Error).message}`);
    }
  }

  /** Admin: every entry (or one school). Principal: entries of their school, without the admin's own actions. */
  async list(user: AuthUser, q: ListAuditLogsQueryDto) {
    const schoolId = this.access.schoolOf(user, q.schoolId);
    const qb = this.logs
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC')
      .skip(pageWindow(q).skip)
      .take(q.limit);
    if (schoolId) qb.andWhere('l.schoolId = :schoolId', { schoolId });
    if (user.role === UserRole.PRINCIPAL) {
      qb.andWhere('(l.userRole IS NULL OR l.userRole <> :admin)', { admin: UserRole.SYSTEM_ADMIN });
    }
    // Dates are local days; created_at is stored in the server's local time (same zone as APP_TIMEZONE).
    if (q.from) qb.andWhere('l.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('l.createdAt < :to', { to: addDays(q.to, 1) });
    if (q.userId) qb.andWhere('l.userId = :userId', { userId: q.userId });
    if (q.role) qb.andWhere('l.userRole = :role', { role: q.role });
    if (q.action) qb.andWhere('l.action = :action', { action: q.action });
    if (q.module) qb.andWhere('l.module = :module', { module: q.module });
    if (q.status) qb.andWhere('l.status = :status', { status: q.status });
    if (q.search) {
      const s = foldSearch(q.search);
      qb.andWhere(
        new Brackets((w) =>
          w.where(likeFolded('l.description', 's'), { s }).orWhere(likeFolded('l.userName', 's'), { s }),
        ),
      );
    }
    const [items, total] = await qb.getManyAndCount();
    return toPage(items, total, q);
  }

  /** Retention: deletes entries older than `before`. */
  async purge(before: string) {
    const res = await this.logs.delete({ createdAt: LessThan(new Date(`${before}T00:00:00`)) });
    return { deleted: res.affected ?? 0 };
  }
}
