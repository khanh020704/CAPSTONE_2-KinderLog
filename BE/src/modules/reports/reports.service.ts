import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';
import { AuthUser } from '../../common/decorators';
import { HealthStatus, JournalStatus, MealLevel, RecordStatus, UserRole } from '../../common/enums';
import { addDays, dateRange, isoDate, weekdayOf } from '../../common/utils/date.util';
import { AccessService } from '../access/access.service';
import { CacheService } from '../cache/cache.service';
import { CameraStream } from '../camera-streams/entities/camera-stream.entity';
import { ClassEntity } from '../classes/entities/class.entity';
import { DailyJournal } from '../daily-journals/entities/daily-journal.entity';
import { School } from '../schools/entities/school.entity';
import { Student } from '../students/entities/student.entity';
import { User } from '../users/entities/user.entity';
import { ReportTable, ReportType } from './dto/report.dto';

/** Meal level → score used for the nutrition index (100 = ate everything). */
const MEAL_SCORE: Record<MealLevel, number> = { ALL: 100, MOST: 75, HALF: 50, LITTLE: 25, NONE: 0 };
const MEAL_SCORE_SQL = `CASE j.meal_level WHEN 'ALL' THEN 100 WHEN 'MOST' THEN 75 WHEN 'HALF' THEN 50 WHEN 'LITTLE' THEN 25 WHEN 'NONE' THEN 0 END`;

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
    const schoolDays = dateRange(s.from, s.to).filter((d) => weekdayOf(d) <= 5);

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
        this.journals
          .createQueryBuilder('j')
          .innerJoin('j.class', 'c')
          .select('c.school_id', 'schoolId')
          .addSelect('COUNT(*)', 'entries')
          .addSelect(`COUNT(*) FILTER (WHERE j.status = '${JournalStatus.APPROVED}')`, 'approved')
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
        const rows = await this.byClassAndDay(s);
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
            { key: 'rate', header: 'Tỷ lệ chuyên cần (%)', width: 20, format: 'percent' },
          ],
          rows: rows.map((r) => ({
            date: r.date,
            className: className.get(r.classId) ?? '',
            present: r.present,
            absent: r.absent,
            rate: pct(r.present, r.present + r.absent),
          })),
        };
      }
      case ReportType.JOURNALS: {
        const [rows, roster] = await Promise.all([this.byClassAndDay(s), this.rosterSizes(s.classIds)]);
        return {
          title: 'Báo cáo tỷ lệ nộp nhật ký',
          subtitle,
          from: s.from,
          to: s.to,
          columns: [
            { key: 'date', header: 'Ngày', width: 12, format: 'date' },
            { key: 'className', header: 'Lớp', width: 18 },
            { key: 'students', header: 'Sĩ số', width: 8, format: 'number' },
            { key: 'logged', header: 'Đã ghi', width: 9, format: 'number' },
            { key: 'draft', header: 'Bản nháp', width: 10, format: 'number' },
            { key: 'approved', header: 'Đã duyệt', width: 10, format: 'number' },
            { key: 'rate', header: 'Tỷ lệ nộp (%)', width: 14, format: 'percent' },
          ],
          rows: rows.map((r) => ({
            date: r.date,
            className: className.get(r.classId) ?? '',
            students: roster.get(r.classId) ?? 0,
            logged: r.logged,
            draft: r.logged - r.approved,
            approved: r.approved,
            rate: pct(r.approved, roster.get(r.classId) ?? 0),
          })),
        };
      }
      case ReportType.NUTRITION: {
        const rows = await this.journals
          .createQueryBuilder('j')
          .innerJoin('j.student', 's')
          .select('s.full_name', 'student')
          .addSelect('j.class_id', 'classId')
          .addSelect('COUNT(j.meal_level)', 'days')
          .addSelect(
            Object.values(MealLevel)
              .map((l) => `COUNT(*) FILTER (WHERE j.meal_level = '${l}') AS "${l}"`)
              .join(', '),
          )
          .addSelect(`AVG(${MEAL_SCORE_SQL})`, 'score')
          .addSelect('AVG(j.sleep_minutes)', 'sleep')
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
    const [students, teachers, parents, cameras] = await Promise.all([
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
    ]);
    return { classes: s.classes.length, students, teachers, parents, cameras };
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
      .addSelect(`COUNT(*) FILTER (WHERE j.attendance = 'PRESENT')`, 'present')
      .addSelect(`COUNT(*) FILTER (WHERE j.attendance = 'ABSENT')`, 'absent')
      .addSelect('COUNT(*)', 'logged')
      .addSelect(`COUNT(*) FILTER (WHERE j.status = 'APPROVED')`, 'approved')
      .where('j.class_id IN (:...ids)', { ids: s.classIds })
      .andWhere('j.journal_date BETWEEN :from AND :to', { from: s.from, to: s.to });
  }

  private async dailyRows(s: Scope) {
    const rows = await this.baseAgg(s, { date: "to_char(j.journal_date, 'YYYY-MM-DD')" })
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
      date: "to_char(j.journal_date, 'YYYY-MM-DD')",
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
      .addSelect(`AVG(${MEAL_SCORE_SQL})`, 'mealScore')
      .addSelect('AVG(j.sleep_minutes)', 'sleep')
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
      .addSelect(`COUNT(*) FILTER (WHERE j.attendance = 'PRESENT')`, 'present')
      .addSelect(`COUNT(*) FILTER (WHERE j.attendance = 'ABSENT')`, 'absent')
      .addSelect('COUNT(*)', 'logged')
      .addSelect(`COUNT(*) FILTER (WHERE j.status = 'APPROVED')`, 'approved')
      .where('j.class_id IN (:...ids)', { ids: s.classIds })
      .andWhere('j.journal_date = :today', { today })
      .groupBy('j.class_id')
      .getRawMany<Record<string, string>>();
    const byClass = new Map(rows.map((r) => [r.classId, r]));
    return {
      date: today,
      classes: s.classes.map((c) => {
        const r = byClass.get(c.id);
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
          journalState: !logged
            ? 'NOT_STARTED'
            : approved >= total && total > 0
              ? 'APPROVED'
              : approved
                ? 'PARTIAL'
                : 'DRAFT',
        };
      }),
    };
  }
}
