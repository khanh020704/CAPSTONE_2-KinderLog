import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { pageWindow, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/decorators';
import {
  AnnouncementAudience,
  AnnouncementStatus,
  NotificationType,
  RecordStatus,
  UserRole,
} from '../../common/enums';
import { isoDate } from '../../common/utils/date.util';
import { foldSearch, likeFolded } from '../../common/utils/sql.util';
import { AccessService } from '../access/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQueryDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { SchoolAnnouncement } from './entities/school-announcement.entity';

const STAFF = [UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL];
const AUDIENCE_ROLES: Record<AnnouncementAudience, UserRole[]> = {
  [AnnouncementAudience.ALL]: [UserRole.TEACHER, UserRole.PARENT],
  [AnnouncementAudience.TEACHERS]: [UserRole.TEACHER],
  [AnnouncementAudience.PARENTS]: [UserRole.PARENT],
};
/** How often scheduled announcements are checked for release. */
const RELEASE_EVERY_MS = 60_000;

/** 00:00 of a calendar day in the given time zone, as an instant. */
function startOfDay(day: string, tz: string) {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const shown = new Date(utcMidnight.toLocaleString('en-US', { timeZone: tz }));
  return new Date(utcMidnight.getTime() - (shown.getTime() - utcMidnight.getTime()));
}

const READER_PAGE: Partial<Record<UserRole, string>> = {
  [UserRole.TEACHER]: '/teacher/notifications',
  [UserRole.PARENT]: '/parent/announcements',
};

@Injectable()
export class AnnouncementsService implements OnModuleInit, OnModuleDestroy {
  private readonly tz: string;
  private readonly logger = new Logger(AnnouncementsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(SchoolAnnouncement) private readonly announcements: Repository<SchoolAnnouncement>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('timezone')!;
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.releaseDue(), RELEASE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Notifies the audience of every published announcement whose publish time has come. Safe to call any time. */
  async releaseDue() {
    try {
      const due = await this.announcements.find({
        where: {
          status: AnnouncementStatus.PUBLISHED,
          notifiedAt: IsNull(),
          publishedAt: LessThanOrEqual(new Date()),
        },
      });
      let released = 0;
      for (const a of due) {
        // claim it first, so a concurrent run (timer and a request) never notifies twice
        const claim = await this.announcements.update(
          { id: a.id, notifiedAt: IsNull() },
          { notifiedAt: new Date() },
        );
        if (!claim.affected) continue;
        await this.notifyAudience(a);
        released += 1;
      }
      return released;
    } catch (err) {
      this.logger.warn(`Scheduled announcements not released: ${(err as Error).message}`);
      return 0;
    }
  }

  /** The instant readers see it: now for today (or no date), 00:00 of a later day; never a past day. */
  private publishTime(publishOn?: string) {
    const today = isoDate(this.tz);
    if (!publishOn || publishOn === today) return new Date();
    if (publishOn < today) throw new BadRequestException('The publish date cannot be in the past');
    return startOfDay(publishOn, this.tz);
  }

  /** Principal / admin: everything of the school. Teachers and parents: published, unexpired, meant for them. */
  async list(user: AuthUser, q: ListAnnouncementsQueryDto) {
    const qb = this.visible(user, q.schoolId)
      .leftJoin('a.createdBy', 'author')
      .addSelect(['author.id', 'author.fullName'])
      .orderBy('a.publishedAt', 'DESC')
      .addOrderBy('a.createdAt', 'DESC')
      .skip(pageWindow(q).skip)
      .take(q.limit);
    if (q.status) qb.andWhere('a.status = :status', { status: q.status });
    if (q.category) qb.andWhere('a.category = :category', { category: q.category });
    if (q.audience) qb.andWhere('a.audience = :audience', { audience: q.audience });
    if (q.search) qb.andWhere(likeFolded('a.title', 'search'), { search: foldSearch(q.search) });
    const [items, total] = await qb.getManyAndCount();
    return toPage(items, total, q);
  }

  async findOne(user: AuthUser, id: string) {
    const a = await this.visible(user)
      .leftJoin('a.createdBy', 'author')
      .addSelect(['author.id', 'author.fullName'])
      .andWhere('a.id = :id', { id })
      .getOne();
    if (!a) throw new NotFoundException('Announcement not found');
    return a;
  }

  async create(user: AuthUser, dto: CreateAnnouncementDto) {
    const schoolId = this.access.requireSchool(user, dto.schoolId);
    const publish = dto.status === AnnouncementStatus.PUBLISHED;
    const saved = await this.announcements.save(
      this.announcements.create({
        schoolId,
        createdById: user.id,
        title: dto.title.trim(),
        content: dto.content.trim(),
        category: dto.category,
        audience: dto.audience,
        status: dto.status ?? AnnouncementStatus.DRAFT,
        publishedAt: publish ? this.publishTime(dto.publishOn) : null,
        expiresOn: dto.expiresOn ?? null,
      }),
    );
    if (publish) await this.releaseDue();
    return this.findOne(user, saved.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    const current = await this.findOne(user, id);
    const publishing = (dto.status ?? current.status) === AnnouncementStatus.PUBLISHED;
    // The publish time is set when first published, and may still move while readers have not been notified.
    const setTime =
      publishing && (!current.publishedAt || (!current.notifiedAt && dto.publishOn !== undefined));
    await this.announcements.update(id, {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.content !== undefined && { content: dto.content.trim() }),
      ...(dto.category && { category: dto.category }),
      ...(dto.audience && { audience: dto.audience }),
      ...(dto.status && { status: dto.status }),
      ...(dto.expiresOn !== undefined && { expiresOn: dto.expiresOn }),
      ...(setTime && { publishedAt: this.publishTime(dto.publishOn) }),
    });
    if (publishing) await this.releaseDue();
    return this.findOne(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.announcements.delete(id);
    return { success: true };
  }

  private visible(user: AuthUser, requestedSchool?: string) {
    const schoolId = this.access.schoolOf(user, requestedSchool);
    const qb = this.announcements.createQueryBuilder('a');
    if (schoolId) qb.andWhere('a.schoolId = :schoolId', { schoolId });
    if (!STAFF.includes(user.role)) {
      const audiences = Object.entries(AUDIENCE_ROLES)
        .filter(([, roles]) => roles.includes(user.role))
        .map(([audience]) => audience);
      qb.andWhere('a.status = :published', { published: AnnouncementStatus.PUBLISHED })
        .andWhere('a.publishedAt <= :now', { now: new Date() })
        .andWhere('a.audience IN (:...audiences)', { audiences })
        .andWhere(
          new Brackets((w) =>
            w.where('a.expiresOn IS NULL').orWhere('a.expiresOn >= :today', { today: isoDate(this.tz) }),
          ),
        );
    }
    return qb;
  }

  /** When it is released: one notification to every active teacher / parent of the audience (unless already expired). */
  private async notifyAudience(a: SchoolAnnouncement) {
    if (a.expiresOn && a.expiresOn < isoDate(this.tz)) return;
    const recipients = await this.users.find({
      where: AUDIENCE_ROLES[a.audience].map((role) => ({
        schoolId: a.schoolId,
        role,
        status: RecordStatus.ACTIVE,
      })),
      select: { id: true, role: true },
    });
    for (const role of AUDIENCE_ROLES[a.audience]) {
      await this.notifications.notify(
        recipients.filter((r) => r.role === role).map((r) => r.id),
        {
          type: NotificationType.ANNOUNCEMENT,
          title: a.title,
          body: a.content.slice(0, 200),
          link: READER_PAGE[role],
          refId: a.id,
        },
      );
    }
  }
}
