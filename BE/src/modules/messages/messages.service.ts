import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { pageWindow, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/decorators';
import { NotificationType, RecordStatus, UserRole } from '../../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { SendMessageDto, ThreadQueryDto } from './dto/message.dto';
import { Message } from './entities/message.entity';

const MESSAGES_PAGE: Partial<Record<UserRole, string>> = {
  [UserRole.TEACHER]: '/teacher/messages',
  [UserRole.PARENT]: '/parent/messages',
};
/** Roles that take part in messaging; the principal and the system admin do not. */
const MESSAGING_ROLES = [UserRole.TEACHER, UserRole.PARENT];

type Contact = Pick<User, 'id' | 'fullName' | 'phone' | 'role' | 'status'>;

/**
 * Who may write to whom (both directions, same school, active accounts):
 *  - parent  ↔ homeroom teacher of their child's class
 *  - teacher ↔ other teachers of the school
 * The principal and the system admin have no messaging.
 */

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  /** People the user may write to, with the last message and unread count of each conversation. */
  async contacts(user: AuthUser) {
    const [people, summary] = await Promise.all([this.allowedContacts(user), this.conversationSummary(user)]);
    const byId = new Map(summary.map((s) => [s.userId, s]));
    const allowed = new Set(people.map((p) => p.id));
    // Earlier conversations stay visible (read-only) even if the relation ended, e.g. a child changed class,
    // but only between a teacher and a parent (not a principal, the admin, or two teachers).
    const former = summary.filter((s) => !allowed.has(s.userId)).map((s) => s.userId);
    const extra = (
      former.length
        ? await this.users.find({
            where: { id: In(former) },
            select: ['id', 'fullName', 'phone', 'role', 'status'],
          })
        : []
    ).filter((p) => MESSAGING_ROLES.includes(p.role) && p.role !== user.role);
    return [
      ...people.map((p) => ({ ...p, canReply: true })),
      ...extra.map((p) => ({ ...p, canReply: false })),
    ]
      .map((p) => {
        const s = byId.get(p.id);
        return {
          user: { id: p.id, fullName: p.fullName, phone: p.phone, role: p.role },
          canReply: p.canReply,
          lastMessage: s ? { content: s.content, senderId: s.senderId, createdAt: s.createdAt } : null,
          unread: s?.unread ?? 0,
        };
      })
      .sort(
        (a, b) =>
          (b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0) -
            (a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0) ||
          a.user.fullName.localeCompare(b.user.fullName),
      );
  }

  async thread(user: AuthUser, otherId: string, q: ThreadQueryDto) {
    const qb = this.messages
      .createQueryBuilder('m')
      .where(
        new Brackets((w) =>
          w
            .where('m.senderId = :me AND m.receiverId = :other')
            .orWhere('m.senderId = :other AND m.receiverId = :me'),
        ),
        { me: user.id, other: otherId },
      )
      .orderBy('m.createdAt', 'DESC')
      .skip(pageWindow(q).skip)
      .take(q.limit);
    if (q.before) qb.andWhere('m.createdAt < :before', { before: new Date(q.before) });
    const [items, total] = await qb.getManyAndCount();
    return toPage(items, total, q);
  }

  async send(user: AuthUser, dto: SendMessageDto) {
    if (dto.receiverId.toLowerCase() === user.id.toLowerCase()) {
      throw new ForbiddenException('You cannot message yourself');
    }
    const receiver = await this.users.findOne({ where: { id: dto.receiverId } });
    if (!receiver || !(await this.canMessage(user, receiver))) {
      throw new ForbiddenException('You cannot send messages to this account');
    }
    const saved = await this.messages.save(
      this.messages.create({ senderId: user.id, receiverId: receiver.id, content: dto.content.trim() }),
    );
    await this.notifications.notify(
      [receiver.id],
      {
        type: NotificationType.MESSAGE,
        title: `New message from ${user.fullName}`,
        body: saved.content.slice(0, 200),
        link: MESSAGES_PAGE[receiver.role] ?? null,
        refId: user.id,
      },
      { merge: true },
    );
    return saved;
  }

  /** Marks everything the other person sent me as read, and the "new message" notification about them. */
  async markThreadRead(user: AuthUser, otherId: string) {
    const res = await this.messages.update(
      { senderId: otherId, receiverId: user.id, readAt: IsNull() },
      { readAt: new Date() },
    );
    await this.notifications.markReadByRef(user.id, NotificationType.MESSAGE, otherId);
    return { updated: res.affected ?? 0 };
  }

  async unreadCount(user: AuthUser) {
    return { unread: await this.messages.count({ where: { receiverId: user.id, readAt: IsNull() } }) };
  }

  /** The sender may correct a message until it has been read. */
  async edit(user: AuthUser, id: string, content: string) {
    const msg = await this.ownMessage(user, id);
    if (msg.readAt) throw new ConflictException('This message has already been read');
    await this.messages.update(id, { content: content.trim() });
    return this.messages.findOneByOrFail({ id });
  }

  async remove(user: AuthUser, id: string) {
    await this.ownMessage(user, id);
    await this.messages.delete(id);
    return { success: true };
  }

  private async ownMessage(user: AuthUser, id: string) {
    const msg = await this.messages.findOne({ where: { id } });
    if (!msg || (msg.senderId !== user.id && msg.receiverId !== user.id)) {
      throw new NotFoundException('Message not found');
    }
    if (msg.senderId !== user.id) throw new ForbiddenException('Only the sender can change a message');
    return msg;
  }

  private async canMessage(user: AuthUser, other: User) {
    if (other.status !== RecordStatus.ACTIVE) return false;
    const ids = (await this.allowedContacts(user, other.id)).map((c) => c.id);
    return ids.length > 0;
  }

  /** The contacts of `user` (only `onlyId` when given, to check one pair cheaply). */
  private async allowedContacts(user: AuthUser, onlyId?: string): Promise<Contact[]> {
    const qb = this.users
      .createQueryBuilder('u')
      .select(['u.id', 'u.fullName', 'u.phone', 'u.role', 'u.status'])
      .where('u.status = :active', { active: RecordStatus.ACTIVE })
      .andWhere('u.id <> :me', { me: user.id })
      .orderBy('u.fullName', 'ASC');
    if (onlyId) qb.andWhere('u.id = :onlyId', { onlyId });

    switch (user.role) {
      case UserRole.TEACHER:
        // Only the parents of children in the teacher's homeroom classes: teachers do not message each other.
        qb.andWhere('u.schoolId = :school', { school: user.schoolId }).andWhere(
          `u.id IN (SELECT l.parent_id FROM parent_student_map l
              JOIN students s ON s.id = l.student_id
              JOIN classes c ON c.id = s.class_id
              WHERE c.homeroom_teacher_id = :me AND l.status = 'ACTIVE')`,
        );
        break;
      case UserRole.PARENT:
        // homeroom teachers of the parent's children
        qb.andWhere('u.schoolId = :school', { school: user.schoolId }).andWhere(
          `u.id IN (SELECT c.homeroom_teacher_id FROM classes c
              JOIN students s ON s.class_id = c.id
              JOIN parent_student_map l ON l.student_id = s.id
              WHERE l.parent_id = :me AND l.status = 'ACTIVE' AND c.homeroom_teacher_id IS NOT NULL)`,
        );
        break;
      default:
        return [];
    }
    return qb.getMany();
  }

  /** Per counterpart: last message (ROW_NUMBER over the pair) and how many of theirs I have not read. */
  private async conversationSummary(user: AuthUser) {
    const rows: {
      userId: string;
      content: string;
      senderId: string;
      createdAt: Date;
      unread: number;
    }[] = await this.messages.query(
      `WITH mine AS (
         SELECT CASE WHEN sender_id = @0 THEN receiver_id ELSE sender_id END AS other_id,
                content, sender_id, created_at, receiver_id, read_at,
                ROW_NUMBER() OVER (
                  PARTITION BY CASE WHEN sender_id = @0 THEN receiver_id ELSE sender_id END
                  ORDER BY created_at DESC) AS rn
         FROM messages WHERE sender_id = @0 OR receiver_id = @0)
       SELECT l.other_id AS userId, l.content, l.sender_id AS senderId, l.created_at AS createdAt,
              (SELECT COUNT(*) FROM mine u WHERE u.other_id = l.other_id
                 AND u.receiver_id = @0 AND u.read_at IS NULL) AS unread
       FROM mine l WHERE l.rn = 1`,
      [user.id],
    );
    return rows.map((r) => ({ ...r, unread: Number(r.unread) }));
  }
}
