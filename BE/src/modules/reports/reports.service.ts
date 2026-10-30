import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThan, Repository } from 'typeorm';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';
import { AuthUser } from '../../common/decorators';
import {
  ClassJournalStatus,
  Gender,
  HealthStatus,
  JournalSource,
  JournalStatus,
  MealLevel,
  RecordStatus,
  Relationship,
  UserRole,
} from '../../common/enums';
import { addDays, dateRange, isoDate, weekdayOf } from '../../common/utils/date.util';
import { avgSql, countWhere, isoDateSql } from '../../common/utils/sql.util';
import { AccessService } from '../access/access.service';
import { CacheService } from '../cache/cache.service';
import { CameraStream } from '../camera-streams/entities/camera-stream.entity';
import { ClassEntity } from '../classes/entities/class.entity';
import { ClassJournal } from '../daily-journals/entities/class-journal.entity';
import { DailyJournal } from '../daily-journals/entities/daily-journal.entity';
import { School } from '../schools/entities/school.entity';
import { Student } from '../students/entities/student.entity';
import { User } from '../users/entities/user.entity';
import { ReportTable, ReportType } from './dto/report.dto';

/** "Approved" in the reports = checked by the principal, whether or not it is published yet. */
const REVIEWED = `j.status IN ('${JournalStatus.APPROVED}', '${JournalStatus.PUBLISHED}')`;

const CJ_REVIEWED = `j.status IN ('${ClassJournalStatus.APPROVED}', '${ClassJournalStatus.PUBLISHED}')`;
/** A class journal's status, as the journal completion report names it. */
const CJ_STATE: Record<ClassJournalStatus, string> = {
  [ClassJournalStatus.DRAFT]: 'DRAFT',
  [ClassJournalStatus.REVIEW]: 'PENDING',
  [ClassJournalStatus.APPROVED]: 'APPROVED',
  [ClassJournalStatus.PUBLISHED]: 'PUBLISHED',
};

/** Meal level → score used for the nutrition index (100 = ate everything). */
const MEAL_SCORE: Record<MealLevel, number> = { ALL: 100, MOST: 75, HALF: 50, LITTLE: 25, NONE: 0 };
const MEAL_SCORE_SQL = `CASE j.meal_level WHEN 'ALL' THEN 100 WHEN 'MOST' THEN 75 WHEN 'HALF' THEN 50 WHEN 'LITTLE' THEN 25 WHEN 'NONE' THEN 0 END`;

/** Text written in exported files for the codes the report rows carry. */
const VI = {
  journalState: {
    PUBLISHED: 'Đã công bố',
    APPROVED: 'Đã duyệt',
    PENDING: 'Chờ duyệt',
    IN_PROGRESS: 'Đang thực hiện',
    DRAFT: 'Bản nháp',
  },
  source: { VOICE: 'Giọng nói (AI)', MANUAL: 'Nhập tay' },
  gender: { [Gender.MALE]: 'Nam', [Gender.FEMALE]: 'Nữ' } as Record<string, string>,
  relationship: {
    [Relationship.MOTHER]: 'Mẹ',
    [Relationship.FATHER]: 'Bố',
    [Relationship.GRANDMOTHER]: 'Bà',
    [Relationship.GRANDFATHER]: 'Ông',
    [Relationship.GUARDIAN]: 'Người giám hộ',
  } as Record<string, string>,
  status: {
    [RecordStatus.ACTIVE]: 'Hoạt động',
    [RecordStatus.INACTIVE]: 'Ngừng hoạt động',
    [RecordStatus.LOCKED]: 'Đã khóa',
  } as Record<string, string>,
};

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const num = (v: unknown) => (v == null ? 0 : Number(v));

interface Scope {
  schoolId: string;
  school: School;
  classes: ClassEntity[];
  classIds: string[];
  from: string;
  to: string;
}

@Injectable()
export class ReportsService {
  private readonly tz: string;

  constructor(
    @InjectRepository(DailyJournal) private readonly journals: Repository<DailyJournal>,
    @InjectRepository(ClassJournal) private readonly classJournals: Repository<ClassJournal>,
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(School) private readonly schools: Repository<School>,
    @InjectRepository(CameraStream) private readonly cameras: Repository<CameraStream>,
    private readonly access: AccessService,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('timezone')!;
  }

  // ================================================================ dashboards

  /** Principal dashboard. Cached in Redis per school + range; invalidated whenever a journal changes. */
  async principalDashboard(user: AuthUser, q: DateRangeQueryDto) {
    const scope = await this.scope(user, q);
    const key = `dash:${scope.schoolId}:${scope.from}:${scope.to}:${q.classId ?? 'all'}`;
    return this.cache.wrap(key, () => this.computeDashboard(scope));
  }

  private async computeDashboard(s: Scope) {
    const today = isoDate(this.tz);
    const [counts, roster, perDay, meals, perClass, alerts] = await Promise.all([
      this.overviewCounts(s),
      this.rosterSizes(s.classIds),
      this.dailyRows(s),
      this.mealDistribution(s),
      this.classStats(s),
      this.healthAlerts(s, 10),
    ]);
    const expectedPerDay = [...roster.values()].reduce((a, b) => a + b, 0);
    // Weekdays, plus any weekend day on which journals were actually logged
    const schoolDays = dateRange(s.from, s.to).filter((d) => weekdayOf(d) <= 5 || perDay.has(d));

    const trend = schoolDays.map((date) => {
      const r = perDay.get(date) ?? { present: 0, absent: 0, logged: 0, approved: 0 };
      return {
        date,
        present: r.present,
        absent: r.absent,
        attendanceRate: pct(r.present, r.present + r.absent),
        logged: r.logged,
        approved: r.approved,
        submissionRate: pct(r.approved, expectedPerDay),
      };
    });
    const totals = trend.reduce(
      (acc, d) => ({
        present: acc.present + d.present,
        absent: acc.absent + d.absent,
        approved: acc.approved + d.approved,
      }),
      { present: 0, absent: 0, approved: 0 },
    );
    const mealTotal = Object.values(meals).reduce((a, b) => a + b, 0);
    const nutritionIndex = mealTotal
      ? Math.round(
          Object.entries(meals).reduce((a, [lvl, n]) => a + MEAL_SCORE[lvl as MealLevel] * n, 0) / mealTotal,
        )
      : null;

    return {
      school: { id: s.school.id, name: s.school.name },
      range: { from: s.from, to: s.to, schoolDays: schoolDays.length },
      overview: counts,
      kpis: {
        attendanceRate: pct(totals.present, totals.present + totals.absent),
        submissionRate: pct(totals.approved, expectedPerDay * schoolDays.length),
        nutritionIndex,
        healthAlerts: alerts.total,
      },
      today: await this.todayByClass(s, today, roster),
      attendanceTrend: trend,
      nutrition: {
        distribution: Object.fromEntries(Object.values(MealLevel).map((l) => [l, meals[l] ?? 0])),
        index: nutritionIndex,
      },
      classes: s.classes.map((c) => {
        const st = perClass.get(c.id);
        return {
          classId: c.id,
          className: c.name,
          students: roster.get(c.id) ?? 0,
          attendanceRate: pct(st?.present ?? 0, (st?.present ?? 0) + (st?.absent ?? 0)),
          submissionRate: pct(st?.approved ?? 0, (roster.get(c.id) ?? 0) * schoolDays.length),
          nutritionIndex: st?.mealScore == null ? null : Math.round(st.mealScore),
          avgSleepMinutes: st?.sleep == null ? null : Math.round(st.sleep),
        };
      }),
      healthAlerts: alerts.items,
    };
  }

  /** System Admin: platform-wide numbers per school. */
  async adminDashboard() {
    return this.cache.wrap('dash:admin', async () => {
      const since = addDays(isoDate(this.tz), -6);
      const [schools, usersByRole, journalsBySchool] = await Promise.all([
        this.schools.find({ order: { createdAt: 'ASC' } }),
        this.users
          .createQueryBuilder('u')
          .select('u.role', 'role')
          .addSelect('u.status', 'status')
          .addSelect('COUNT(*)', 'n')
          .groupBy('u.role')
          .addGroupBy('u.status')
          .getRawMany<{ role: UserRole; status: RecordStatus; n: string }>(),
        this.classJournals
          .createQueryBuilder('j')
          .innerJoin('j.class', 'c')
          .select('c.school_id', 'schoolId')
          .addSelect('COUNT(*)', 'entries')
          .addSelect(countWhere(CJ_REVIEWED), 'approved')
          .where('j.journal_date >= :since', { since })
          .groupBy('c.school_id')
          .getRawMany<{ schoolId: string; entries: string; approved: string }>(),
      ]);
      const users = Object.fromEntries(Object.values(UserRole).map((r) => [r, { total: 0, active: 0 }]));
      for (const row of usersByRole) {
        users[row.role].total += num(row.n);
        if (row.status === RecordStatus.ACTIVE) users[row.role].active += num(row.n);
      }
      const bySchool = new Map(journalsBySchool.map((r) => [r.schoolId, r]));
      return {
        totals: {
          schools: schools.length,
          activeSchools: schools.filter((x) => x.status === RecordStatus.ACTIVE).length,
          users,
        },
        last7Days: schools.map((x) => ({
          schoolId: x.id,
          schoolName: x.name,
          status: x.status,
          journalEntries: num(bySchool.get(x.id)?.entries),
          approvedEntries: num(bySchool.get(x.id)?.approved),
        })),
      };
    });
  }

  // ================================================================ exports

  async buildReport(user: AuthUser, type: ReportType, q: DateRangeQueryDto): Promise<ReportTable> {
    const s = await this.scope(user, q);
    const subtitle = `${s.school.name} · ${s.from} → ${s.to}${q.classId ? ` · ${s.classes[0]?.name}` : ''}`;
    const className = new Map(s.classes.map((c) => [c.id, c.name]));

    switch (type) {
      case ReportType.ATTENDANCE: {
        const [rows, roster] = await Promise.all([this.byClassAndDay(s), this.rosterSizes(s.classIds)]);
        return {
          title: 'Báo cáo chuyên cần',
          subtitle,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'date', header: 'Ngày', width: 12, format: 'date' },
            { key: 'className', header: 'Lớp', width: 18 },
            { key: 'present', header: 'Có mặt', width: 10, format: 'number' },
            { key: 'absent', header: 'Vắng', width: 10, format: 'number' },
            { key: 'unrecorded', header: 'Chưa ghi nhận', width: 14, format: 'number' },
            { key: 'rate', header: 'Tỷ lệ chuyên cần (%)', width: 20, format: 'percent' },
          ],
          rows: rows.map((r) => ({
            date: r.date,
            className: className.get(r.classId) ?? '',
            present: r.present,
            absent: r.absent,
            unrecorded: Math.max(0, (roster.get(r.classId) ?? 0) - r.present - r.absent),
            rate: pct(r.present, r.present + r.absent),
          })),
        };
      }
      case ReportType.JOURNALS: {
        const rows = await this.journalCompletion(s);
        return {
          title: 'Báo cáo hoàn thành nhật ký',
          subtitle,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'date', header: 'Ngày', width: 12, format: 'date' },
            { key: 'className', header: 'Lớp', width: 18 },
            { key: 'status', header: 'Trạng thái', width: 16, labels: VI.journalState },
            { key: 'createdWith', header: 'Cách tạo', width: 16, labels: VI.source },
            { key: 'photos', header: 'Ảnh', width: 8, format: 'number' },
            { key: 'lastEdited', header: 'Sửa lần cuối', width: 18 },
          ],
          rows: rows.map(({ classId, ...r }) => ({ ...r, className: className.get(classId) ?? '' })),
        };
      }
      case ReportType.ACTIVITY: {
        const rows = await this.classActivity(s);
        return {
          title: 'Báo cáo hoạt động lớp học',
          subtitle,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'className', header: 'Lớp', width: 16 },
            { key: 'teacher', header: 'Giáo viên chủ nhiệm', width: 24 },
            { key: 'students', header: 'Sĩ số', width: 8, format: 'number' },
            { key: 'attendanceDays', header: 'Số ngày điểm danh', width: 16, format: 'number' },
            { key: 'journalsPublished', header: 'Nhật ký đã công bố', width: 18, format: 'number' },
            { key: 'photos', header: 'Ảnh đã chia sẻ', width: 14, format: 'number' },
            { key: 'messages', header: 'Tin nhắn', width: 10, format: 'number' },
          ],
          rows,
        };
      }
      case ReportType.STUDENTS: {
        const students = await this.students.find({
          where: { classId: In(s.classIds) },
          relations: { class: true, parentLinks: { parent: true } },
          order: { fullName: 'ASC' },
        });
        return {
          title: 'Danh sách học sinh',
          subtitle: `${s.school.name}${q.classId ? ` · ${s.classes[0]?.name}` : ''}`,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'fullName', header: 'Họ tên', width: 24 },
            { key: 'dateOfBirth', header: 'Ngày sinh', width: 12, format: 'date' },
            { key: 'gender', header: 'Giới tính', width: 10, labels: VI.gender },
            { key: 'className', header: 'Lớp', width: 14 },
            { key: 'parents', header: 'Phụ huynh', width: 28 },
            { key: 'status', header: 'Trạng thái', width: 14, labels: VI.status },
          ],
          rows: students.map((st) => ({
            fullName: st.fullName,
            dateOfBirth: st.dateOfBirth,
            gender: st.gender,
            className: st.class?.name ?? '',
            parents: st.parentLinks
              .map((l) => l.parent?.fullName)
              .filter(Boolean)
              .join(', '),
            status: st.status,
          })),
        };
      }
      case ReportType.PARENTS: {
        const students = await this.students.find({
          where: { classId: In(s.classIds) },
          relations: { class: true, parentLinks: { parent: true } },
        });
        const rows = students
          .flatMap((st) =>
            st.parentLinks
              .filter((l) => l.parent)
              .map((l) => ({
                parent: l.parent.fullName,
                phone: l.parent.phone,
                child: st.fullName,
                className: st.class?.name ?? '',
                relationship: l.relationship,
                status: l.parent.status,
              })),
          )
          .sort((a, b) => a.parent.localeCompare(b.parent, 'vi') || a.child.localeCompare(b.child, 'vi'));
        return {
          title: 'Danh sách phụ huynh',
          subtitle: `${s.school.name}${q.classId ? ` · ${s.classes[0]?.name}` : ''}`,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'parent', header: 'Phụ huynh', width: 24 },
            { key: 'phone', header: 'Điện thoại', width: 14 },
            { key: 'child', header: 'Trẻ', width: 24 },
            { key: 'className', header: 'Lớp', width: 14 },
            { key: 'relationship', header: 'Quan hệ', width: 14, labels: VI.relationship },
            { key: 'status', header: 'Trạng thái', width: 14, labels: VI.status },
          ],
          rows,
        };
      }
      case ReportType.NUTRITION: {
        const rows = await this.journals
          .createQueryBuilder('j')
          .innerJoin('j.student', 's')
          .select('s.full_name', 'student')
          .addSelect('j.class_id', 'classId')
          .addSelect('COUNT(j.meal_level)', 'days')
          .addSelect(countWhere(`j.meal_level = '${MealLevel.ALL}'`), MealLevel.ALL)
          .addSelect(countWhere(`j.meal_level = '${MealLevel.MOST}'`), MealLevel.MOST)
          .addSelect(countWhere(`j.meal_level = '${MealLevel.HALF}'`), MealLevel.HALF)
          .addSelect(countWhere(`j.meal_level = '${MealLevel.LITTLE}'`), MealLevel.LITTLE)
          .addSelect(countWhere(`j.meal_level = '${MealLevel.NONE}'`), MealLevel.NONE)
          .addSelect(avgSql(MEAL_SCORE_SQL), 'score')
          .addSelect(avgSql('j.sleep_minutes'), 'sleep')
          .where('j.class_id IN (:...ids)', { ids: s.classIds })
          .andWhere('j.journal_date BETWEEN :from AND :to', { from: s.from, to: s.to })
          .groupBy('s.id')
          .addGroupBy('s.full_name')
          .addGroupBy('j.class_id')
          .orderBy('j.class_id')
          .addOrderBy('s.full_name')
          .getRawMany<Record<string, string>>();
        return {
          title: 'Báo cáo dinh dưỡng & giấc ngủ',
          subtitle,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'className', header: 'Lớp', width: 14 },
            { key: 'student', header: 'Học sinh', width: 24 },
            { key: 'days', header: 'Số bữa', width: 8, format: 'number' },
            { key: 'ALL', header: 'Ăn hết', width: 8, format: 'number' },
            { key: 'MOST', header: 'Gần hết', width: 8, format: 'number' },
            { key: 'HALF', header: 'Một nửa', width: 8, format: 'number' },
            { key: 'LITTLE', header: 'Ăn ít', width: 8, format: 'number' },
            { key: 'NONE', header: 'Không ăn', width: 9, format: 'number' },
            { key: 'score', header: 'Chỉ số DD', width: 10, format: 'number' },
            { key: 'sleep', header: 'Ngủ TB (phút)', width: 12, format: 'number' },
          ],
          rows: rows.map((r) => ({
            className: className.get(r.classId) ?? '',
            student: r.student,
            days: num(r.days),
            ALL: num(r.ALL),
            MOST: num(r.MOST),
            HALF: num(r.HALF),
            LITTLE: num(r.LITTLE),
            NONE: num(r.NONE),
            score: r.score == null ? null : Math.round(num(r.score)),
            sleep: r.sleep == null ? null : Math.round(num(r.sleep)),
          })),
        };
      }
      case ReportType.HEALTH: {
        const { items } = await this.healthAlerts(s, 1000);
        return {
          title: 'Báo cáo sức khỏe cần theo dõi',
          subtitle,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'date', header: 'Ngày', width: 12, format: 'date' },
            { key: 'className', header: 'Lớp', width: 16 },
            { key: 'studentName', header: 'Học sinh', width: 24 },
            { key: 'healthStatus', header: 'Tình trạng', width: 12 },
            { key: 'temperature', header: 'Nhiệt độ', width: 10, format: 'number' },
            { key: 'note', header: 'Ghi chú', width: 40 },
          ],
          rows: items.map((i) => ({ ...i, className: className.get(i.classId) ?? '' })),
        };
      }
    }
  }

  // ================================================================ queries

  /** One row per class and day with a journal: its state, how it was written, photos, last change. */
  private async journalCompletion(s: Scope) {
    const rows = await this.classJournals.find({
      where: { classId: In(s.classIds), journalDate: Between(s.from, s.to) },
      select: { journalDate: true, classId: true, status: true, source: true, photos: true, updatedAt: true },
    });
    return rows
      .map((j) => ({
        date: j.journalDate,
        classId: j.classId,
        status: CJ_STATE[j.status],
        createdWith: j.source === JournalSource.VOICE ? 'VOICE' : 'MANUAL',
        photos: j.photos.length,
        lastEdited: this.localDateTime(j.updatedAt),
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.classId.localeCompare(b.classId));
  }

  /** Per class over the range. Messages are counted between the homeroom teacher and parents, never read. */
  private async classActivity(s: Scope) {
    const [roster, perClass, published, teachers] = await Promise.all([
      this.rosterSizes(s.classIds),
      this.journals
        .createQueryBuilder('j')
        .select('j.class_id', 'classId')
        .addSelect('COUNT(DISTINCT j.journal_date)', 'days')
        .where('j.class_id IN (:...ids)', { ids: s.classIds })
        .andWhere('j.journal_date BETWEEN :from AND :to', { from: s.from, to: s.to })
        .groupBy('j.class_id')
        .getRawMany<Record<string, string>>(),
      this.classJournals.find({
        where: { classId: In(s.classIds), journalDate: Between(s.from, s.to), revision: MoreThan(0) },
        select: { classId: true, publishedVersion: true },
      }),
      this.users.find({
        where: { id: In(s.classes.map((c) => c.homeroomTeacherId).filter(Boolean) as string[]) },
      }),
    ]);
    const byClass = new Map(perClass.map((r) => [r.classId, r]));
    const teacherName = new Map(teachers.map((t) => [t.id, t.fullName]));
    const messages = new Map<string, number>();
    for (const c of s.classes.filter((x) => x.homeroomTeacherId)) {
      const [row] = await this.users.query<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM messages m
           JOIN users o ON o.id = CASE WHEN m.sender_id = @0 THEN m.receiver_id ELSE m.sender_id END
         WHERE (m.sender_id = @0 OR m.receiver_id = @0) AND o.role = 'PARENT'
           AND m.created_at >= @1 AND m.created_at < @2`,
        [c.homeroomTeacherId, s.from, addDays(s.to, 1)],
      );
      messages.set(c.id, num(row?.n));
    }
    return s.classes.map((c) => ({
      className: c.name,
      teacher: (c.homeroomTeacherId && teacherName.get(c.homeroomTeacherId)) || '',
      students: roster.get(c.id) ?? 0,
      attendanceDays: num(byClass.get(c.id)?.days),
      journalsPublished: published.filter((j) => j.classId === c.id).length,
      // Photos parents can see: those of the published versions.
      photos: published
        .filter((j) => j.classId === c.id)
        .reduce((n, j) => n + (j.publishedVersion?.photos.length ?? 0), 0),
      messages: messages.get(c.id) ?? 0,
    }));
  }

  /** Distinct photo files in the range, keyed "date|classId" (date '' when not grouped by day). */
  /** "YYYY-MM-DD HH:mm" in the school's time zone. */
  private localDateTime(v: Date | string | null) {
    if (!v) return null;
    const d = new Date(v);
    return d.toLocaleString('sv-SE', { timeZone: this.tz, hour12: false }).slice(0, 16);
  }

  private async scope(user: AuthUser, q: DateRangeQueryDto): Promise<Scope> {
    const schoolId = this.access.requireSchool(user, q.schoolId);
    const to = q.to ?? isoDate(this.tz);
    const from = q.from ?? addDays(to, -6);
    if (from > to) throw new BadRequestException('"from" must not be after "to"');
    if (dateRange(from, to).length > 366) throw new BadRequestException('The range cannot exceed one year');

    const school = await this.schools.findOneByOrFail({ id: schoolId });
    let classes: ClassEntity[];
    if (q.classId) {
      const cls = await this.access.assertClass(user, q.classId);
      if (cls.schoolId !== schoolId) throw new BadRequestException('The class is not in this school');
      classes = [cls];
    } else {
      classes = await this.classes.find({
        where: { schoolId, status: RecordStatus.ACTIVE },
        order: { name: 'ASC' },
      });
    }
    return {
      schoolId,
      school,
      classes,
      classIds: classes.length ? classes.map((c) => c.id) : ['00000000-0000-0000-0000-000000000000'],
      from,
      to,
    };
  }

  private async overviewCounts(s: Scope) {
    const [students, teachers, parents, cameras, unread] = await Promise.all([
      this.students
        .createQueryBuilder('s')
        .where('s.class_id IN (:...ids)', { ids: s.classIds })
        .andWhere('s.status = :st', { st: RecordStatus.ACTIVE })
        .getCount(),
      this.users.count({
        where: { schoolId: s.schoolId, role: UserRole.TEACHER, status: RecordStatus.ACTIVE },
      }),
      this.users.count({
        where: { schoolId: s.schoolId, role: UserRole.PARENT, status: RecordStatus.ACTIVE },
      }),
      this.cameras.createQueryBuilder('c').where('c.class_id IN (:...ids)', { ids: s.classIds }).getCount(),
      // Messages between the school's teachers and parents not read yet (a count only, never their content).
      this.users.query<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM messages m
           JOIN users r ON r.id = m.receiver_id
           JOIN users w ON w.id = m.sender_id
         WHERE m.read_at IS NULL AND r.school_id = @0
           AND ((r.role = 'TEACHER' AND w.role = 'PARENT') OR (r.role = 'PARENT' AND w.role = 'TEACHER'))`,
        [s.schoolId],
      ),
    ]);
    return {
      classes: s.classes.length,
      students,
      teachers,
      parents,
      cameras,
      unreadMessages: Number(unread[0]?.n ?? 0),
    };
  }

  private async rosterSizes(classIds: string[]) {
    const rows = await this.students
      .createQueryBuilder('s')
      .select('s.class_id', 'classId')
      .addSelect('COUNT(*)', 'n')
      .where('s.class_id IN (:...ids)', { ids: classIds })
      .andWhere('s.status = :st', { st: RecordStatus.ACTIVE })
      .groupBy('s.class_id')
      .getRawMany<{ classId: string; n: string }>();
    return new Map(rows.map((r) => [r.classId, num(r.n)]));
  }

  /** Present / absent / logged / approved counts, grouped by whatever `groupCols` the caller selects. */
  private baseAgg(s: Scope, groupCols: Record<string, string>) {
    const qb = this.journals.createQueryBuilder('j').select([]);
    for (const [alias, expr] of Object.entries(groupCols)) qb.addSelect(expr, alias);
    return qb
      .addSelect(countWhere(`j.attendance = 'PRESENT'`), 'present')
      .addSelect(countWhere(`j.attendance = 'ABSENT'`), 'absent')
      .addSelect('COUNT(*)', 'logged')
      .addSelect(countWhere(REVIEWED), 'approved')
      .where('j.class_id IN (:...ids)', { ids: s.classIds })
      .andWhere('j.journal_date BETWEEN :from AND :to', { from: s.from, to: s.to });
  }

  private async dailyRows(s: Scope) {
    const rows = await this.baseAgg(s, { date: isoDateSql('j.journal_date') })
      .groupBy('j.journal_date')
      .getRawMany<Record<string, string>>();
    return new Map(
      rows.map((r) => [
        r.date,
        { present: num(r.present), absent: num(r.absent), logged: num(r.logged), approved: num(r.approved) },
      ]),
    );
  }

  private async byClassAndDay(s: Scope) {
    const rows = await this.baseAgg(s, {
      date: isoDateSql('j.journal_date'),
      classId: 'j.class_id',
    })
      .groupBy('j.journal_date')
      .addGroupBy('j.class_id')
      .orderBy('j.journal_date', 'DESC')
      .getRawMany<Record<string, string>>();
    return rows.map((r) => ({
      date: r.date,
      classId: r.classId,
      present: num(r.present),
      absent: num(r.absent),
      logged: num(r.logged),
      approved: num(r.approved),
    }));
  }

  private async classStats(s: Scope) {
    const rows = await this.baseAgg(s, { classId: 'j.class_id' })
      .addSelect(avgSql(MEAL_SCORE_SQL), 'mealScore')
      .addSelect(avgSql('j.sleep_minutes'), 'sleep')
      .groupBy('j.class_id')
      .getRawMany<Record<string, string | null>>();
    return new Map(
      rows.map((r) => [
        r.classId!,
        {
          present: num(r.present),
          absent: num(r.absent),
          approved: num(r.approved),
          mealScore: r.mealScore == null ? null : num(r.mealScore),
          sleep: r.sleep == null ? null : num(r.sleep),
        },
      ]),
    );
  }

  private async mealDistribution(s: Scope) {
    const rows = await this.journals
      .createQueryBuilder('j')
      .select('j.meal_level', 'level')
      .addSelect('COUNT(*)', 'n')
      .where('j.class_id IN (:...ids)', { ids: s.classIds })
      .andWhere('j.journal_date BETWEEN :from AND :to', { from: s.from, to: s.to })
      .andWhere('j.meal_level IS NOT NULL')
      .groupBy('j.meal_level')
      .getRawMany<{ level: MealLevel; n: string }>();
    return Object.fromEntries(rows.map((r) => [r.level, num(r.n)])) as Record<MealLevel, number>;
  }

  private async healthAlerts(s: Scope, limit: number) {
    const qb = this.journals
      .createQueryBuilder('j')
      .innerJoinAndSelect('j.student', 'st')
      .where('j.class_id IN (:...ids)', { ids: s.classIds })
      .andWhere('j.journal_date BETWEEN :from AND :to', { from: s.from, to: s.to })
      .andWhere('j.health_status IN (:...hs)', { hs: [HealthStatus.MONITOR, HealthStatus.SICK] })
      .orderBy('j.journalDate', 'DESC'); // property name: required by take() with joins
    const [rows, total] = await qb.take(limit).getManyAndCount();
    return {
      total,
      items: rows.map((j) => ({
        date: j.journalDate,
        classId: j.classId,
        studentId: j.studentId,
        studentName: j.student.fullName,
        healthStatus: j.healthStatus,
        temperature: j.temperature,
        note: j.healthNote,
      })),
    };
  }

  private async todayByClass(s: Scope, today: string, roster: Map<string, number>) {
    const rows = await this.journals
      .createQueryBuilder('j')
      .select('j.class_id', 'classId')
      .addSelect(countWhere(`j.attendance = 'PRESENT'`), 'present')
      .addSelect(countWhere(`j.attendance = 'ABSENT'`), 'absent')
      .addSelect('COUNT(*)', 'logged')
      .addSelect(countWhere(REVIEWED), 'approved')
      .where('j.class_id IN (:...ids)', { ids: s.classIds })
      .andWhere('j.journal_date = :today', { today })
      .groupBy('j.class_id')
      .getRawMany<Record<string, string>>();
    const byClass = new Map(rows.map((r) => [r.classId, r]));
    const journals = await this.classJournals.find({
      where: { classId: In(s.classIds), journalDate: today },
      select: { classId: true, status: true },
    });
    return {
      date: today,
      classes: s.classes.map((c) => {
        const r = byClass.get(c.id);
        const journal = journals.find((j) => j.classId === c.id);
        const total = roster.get(c.id) ?? 0;
        const approved = num(r?.approved);
        const logged = num(r?.logged);
        return {
          classId: c.id,
          className: c.name,
          total,
          present: num(r?.present),
          absent: num(r?.absent),
          logged,
          approved,
          journalStatus: journal?.status ?? null,
          // The class journal of the day: not started, being written (draft / review), or approved / published.
          journalState: !journal
            ? 'NOT_STARTED'
            : [ClassJournalStatus.APPROVED, ClassJournalStatus.PUBLISHED].includes(journal.status)
              ? 'APPROVED'
              : 'DRAFT',
        };
      }),
    };
  }
}
