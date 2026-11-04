import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { pageWindow, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/decorators';
import { NotificationType, RecordStatus, UserRole } from '../../common/enums';
import { AccessService } from '../access/access.service';
import { User } from '../users/entities/user.entity';
import { ListNotificationsQueryDto, SendNotificationDto } from './dto/notification.dto';
import { Notification } from './entities/notification.entity';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  refId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessService,
  ) {}

  async list(user: AuthUser, q: ListNotificationsQueryDto) {
    const where = {
      userId: user.id,
      ...(q.unread === 'true' && { readAt: IsNull() }),
      ...(q.type && { type: q.type }),
    };
    const [items, total] = await this.notifications.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      ...pageWindow(q),
    });
    return toPage(items, total, q);
  }

  async unreadCount(user: AuthUser) {
    return { unread: await this.notifications.count({ where: { userId: user.id, readAt: IsNull() } }) };
  }

  async markRead(user: AuthUser, id: string) {
    const n = await this.own(user, id);
    if (!n.readAt) await this.notifications.update(id, { readAt: new Date() });
    return this.own(user, id);
  }

  async markAllRead(user: AuthUser) {
    const res = await this.notifications.update(
      { userId: user.id, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: res.affected ?? 0 };
  }

  /** Internal: marks the unread notifications of `userId` about `refId` as read (e.g. a conversation was opened). */
  async markReadByRef(userId: string, type: NotificationType, refId: string) {
    await this.notifications.update({ userId, type, refId, readAt: IsNull() }, { readAt: new Date() });
  }

  async remove(user: AuthUser, id: string) {
    await this.own(user, id);
    await this.notifications.delete(id);
    return { success: true };
  }

  /** Principal → accounts of their school; admin → any account (or a role of one school). */
  async send(actor: AuthUser, dto: SendNotificationDto) {
    if (!dto.userIds?.length && !dto.role) throw new BadRequestException('Give userIds or role');
    const schoolId = this.access.schoolOf(actor, dto.schoolId);
    const qb = this.users
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.schoolId', 'schoolId')
      .where('u.status = :st', { st: RecordStatus.ACTIVE });
    if (dto.userIds?.length) qb.andWhere('u.id IN (:...ids)', { ids: dto.userIds });
    if (dto.role) qb.andWhere('u.role = :role', { role: dto.role });
    if (dto.role && !dto.userIds?.length && !schoolId && dto.role !== UserRole.PRINCIPAL) {
      throw new BadRequestException('schoolId is required to notify a whole role');
    }
    if (schoolId && dto.role && !dto.userIds?.length) qb.andWhere('u.schoolId = :schoolId', { schoolId });
    const targets = await qb.getRawMany<{ id: string; schoolId: string | null }>();
    if (actor.role === UserRole.PRINCIPAL && targets.some((t) => t.schoolId !== actor.schoolId)) {
      throw new ForbiddenException('You can only notify accounts of your school');
    }
    if (!targets.length) throw new BadRequestException('No active account matches');
    await this.notify(
      targets.map((t) => t.id),
      { type: NotificationType.SYSTEM, title: dto.title, body: dto.body, link: dto.link },
    );
    return { sent: targets.length };
  }

  /**
   * Internal: one notification per user. With `merge`, an unread notification of the same type and refId is
   * refreshed instead of adding another (e.g. five messages from the same parent → one "new messages" entry).
   */
  async notify(userIds: string[], input: NotificationInput, { merge = false } = {}) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    if (merge && input.refId) {
      const existing = await this.notifications.find({
        where: { userId: In(ids), type: input.type, refId: input.refId, readAt: IsNull() },
        select: { id: true, userId: true },
      });
      if (existing.length) {
        await this.notifications.update(
          { id: In(existing.map((n) => n.id)) },
          { title: input.title, body: input.body ?? null, link: input.link ?? null, createdAt: new Date() },
        );
        const done = new Set(existing.map((n) => n.userId));
        ids.splice(0, ids.length, ...ids.filter((id) => !done.has(id)));
      }
    }
    const rows = ids.map((userId) =>
      this.notifications.create({
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 1000) ?? null,
        link: input.link ?? null,
        refId: input.refId ?? null,
      }),
    );
    // 10 parameters per row: stay well below SQL Server's 2100 per statement
    await this.notifications.save(rows, { chunk: 150 });
  }

  private async own(user: AuthUser, id: string) {
    const n = await this.notifications.findOne({ where: { id, userId: user.id } });
    if (!n) throw new NotFoundException('Notification not found');
    return n;
  }
}
