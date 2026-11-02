import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { AttendanceStatus, JournalSource, JournalStatus, RecordStatus, UserRole } from '../../common/enums';
import { isoDate } from '../../common/utils/date.util';
import { AccessService } from '../access/access.service';
import { Student } from '../students/entities/student.entity';
import { BulkJournalDto, JournalFieldsDto, UpsertJournalDto } from './dto/journal.dto';
import { ClassJournal } from './entities/class-journal.entity';
import { DailyJournal } from './entities/daily-journal.entity';
import { normalize, pickFields } from './journal-fields';

/**
 * Saves rows one after another on the transaction's connection. A multi-row repo.save() makes TypeORM 0.3 send
 * its SELECTs/UPDATEs in parallel, but a SQL Server connection runs one request at a time, so they would only queue
 * up anyway. A class has ~30 children, so the sequential round trips are negligible.
 */
async function saveInOrder<T extends object>(repo: Repository<T>, rows: T[]): Promise<T[]> {
  const out: T[] = [];
  for (const row of rows) out.push(await repo.save(row));
  return out;
}

/** Number of entries at each status: { draft, pending, approved, published }. */
const countByStatus = (entries: { status: JournalStatus }[]) =>
  Object.fromEntries(
    Object.values(JournalStatus).map((s) => [s.toLowerCase(), entries.filter((e) => e.status === s).length]),
  ) as Record<Lowercase<JournalStatus>, number>;

@Injectable()
export class DailyJournalsService {
  private readonly tz: string;

  constructor(
    @InjectRepository(DailyJournal) private readonly journals: Repository<DailyJournal>,
    @InjectRepository(ClassJournal) private readonly classJournals: Repository<ClassJournal>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('timezone')!;
  }

  today() {
    return isoDate(this.tz);
  }

  /**
   * Teachers write, change, approve and publish today's journal only (school time zone); an earlier day stays readable
   * and is handled by the principal, who may correct any past day. Never the future.
   */
  resolveDate(user: AuthUser, date?: string): string {
    const today = this.today();
    const d = date ?? today;
    if (d > today) throw new BadRequestException('Journals cannot be written for a future date');
    if (user.role === UserRole.TEACHER && d < today) {
      throw new ForbiddenException(
        "Teachers can only change today's journal. Ask the principal to correct an earlier day.",
      );
    }
    return d;
  }

  /** Whether `user` may still change a journal of `date` (the rule of resolveDate), shown to the FE as `editable`. */
  isEditable(user: AuthUser, date: string): boolean {
    if (user.role !== UserRole.TEACHER && user.role !== UserRole.PRINCIPAL) return false;
    return date <= this.today() && (user.role === UserRole.PRINCIPAL || date === this.today());
  }

  /**
   * Attendance (each child's entry of a day): a teacher takes it for today only, in the school's time zone; a missed
   * or wrong day is corrected by the principal. Never the future.
   */
  resolveAttendanceDate(user: AuthUser, date?: string): string {
    const d = date ?? this.today();
    if (user.role === UserRole.TEACHER && d < this.today()) {
      throw new ForbiddenException(
        'Teachers can only take attendance for today. Ask the principal to correct an earlier day.',
      );
    }
    return this.resolveDate(user, d);
  }

  // ------------------------------------------------------------------ read

  /** The class register for one day: every active child with their entry (or null) and a summary. */
  async classDay(user: AuthUser, classId: string, date?: string) {
    const cls = await this.access.assertClass(user, classId);
    const day = date ?? this.today();
    const [roster, entries, classJournal] = await Promise.all([
      this.activeStudents(classId),
      this.journals.find({ where: { classId, journalDate: day }, relations: { photos: true } }),
      this.classJournals.findOne({ where: { classId, journalDate: day } }),
    ]);
    const byStudent = new Map(entries.map((e) => [e.studentId, e]));
    const visible =
      user.role === UserRole.PARENT ? entries.filter((e) => e.status === JournalStatus.PUBLISHED) : entries;

    return {
      class: { id: cls.id, name: cls.name },
      date: day,
      // The day's class journal (its content is read through /class-journals/:id).
      classJournal: classJournal && {
        id: classJournal.id,
        status: classJournal.status.toLowerCase(),
        source: classJournal.source === JournalSource.VOICE ? 'voice' : 'manual',
        revision: classJournal.revision,
        updatedAt: classJournal.updatedAt,
      },
      summary: {
        total: roster.length,
        logged: entries.length,
        missing: roster.filter((s) => !byStudent.has(s.id)).length,
        present: entries.filter((e) => e.attendance === AttendanceStatus.PRESENT).length,
        absent: entries.filter((e) => e.attendance === AttendanceStatus.ABSENT).length,
        ...countByStatus(entries),
        exceptions: entries.filter((e) => e.isException).length,
      },
      students: roster.map((s) => ({
        student: {
          id: s.id,
          fullName: s.fullName,
          gender: s.gender,
          allergies: s.allergies,
          avatarUrl: s.avatarUrl,
        },
        journal: visible.find((e) => e.studentId === s.id) ?? null,
      })),
    };
  }

  /**
   * Attendance only (no journal content), so parents know the child arrived before the journal is published.
   * The reason is given for an absence; a note on a present child (e.g. "arrived late") stays with the staff.
   */
  async attendance(user: AuthUser, studentId: string, date?: string) {
    await this.access.assertStudent(user, studentId);
    const day = date ?? this.today();
    const entry = await this.journals.findOne({
      where: { studentId, journalDate: day },
      select: { id: true, attendance: true, absenceReason: true },
    });
    const absent = entry?.attendance === AttendanceStatus.ABSENT;
    return {
      studentId,
      date: day,
      attendance: entry?.attendance ?? null,
      absenceReason: absent || user.role !== UserRole.PARENT ? (entry?.absenceReason ?? null) : null,
    };
  }

  /** What is saved for a class day, per child: the AI review checks a new recording against it. */
  async savedAttendance(classId: string, date?: string) {
    const rows = await this.journals.find({
      where: { classId, journalDate: date ?? this.today() },
      select: { studentId: true, attendance: true, absenceReason: true },
    });
    return new Map(
      rows.map((r) => [r.studentId, { attendance: r.attendance, absenceReason: r.absenceReason }]),
    );
  }

  async findOne(user: AuthUser, id: string) {
    const entry = await this.journals.findOne({ where: { id }, relations: { photos: true, student: true } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    await this.access.assertStudent(user, entry.studentId);
    if (user.role === UserRole.PARENT && entry.status !== JournalStatus.PUBLISHED) {
      throw new NotFoundException('Journal entry not found');
    }
    return entry;
  }

  // ------------------------------------------------------------------ write

  /**
   * Bulk logging with exceptions. One transaction:
   *   entry = existing values ← class defaults ← this child's exception
   * New entries start as DRAFT; an existing entry keeps its status, so a correction (typed or by voice) updates the
   * same row in place.
   */
  async bulkUpsert(user: AuthUser, dto: BulkJournalDto, source = dto.source ?? JournalSource.BULK) {
    const cls = await this.access.assertClassWritable(user, dto.classId);
    const date = this.resolveAttendanceDate(user, dto.date);
    const roster = await this.activeStudents(cls.id);
    const rosterIds = new Set(roster.map((s) => s.id));

    const exceptions = new Map<string, JournalFieldsDto>();
    for (const ex of dto.exceptions ?? []) {
      if (!rosterIds.has(ex.studentId))
        throw new BadRequestException(`Student ${ex.studentId} is not an active member of this class`);
      exceptions.set(ex.studentId, { ...exceptions.get(ex.studentId), ...ex });
    }
    const defaults = pickFields(dto.defaults);

    const result = await this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(DailyJournal);
      const existing = new Map(
        (await repo.find({ where: { classId: cls.id, journalDate: date } })).map((e) => [e.studentId, e]),
      );
      const warnings: { studentId: string; studentName: string; messages: string[] }[] = [];

      const rows = roster.map((s) => {
        const override = pickFields(exceptions.get(s.id));
        const wasAbsent = existing.get(s.id)?.attendance === AttendanceStatus.ABSENT;
        const row =
          existing.get(s.id) ??
          repo.create({ studentId: s.id, classId: cls.id, journalDate: date, createdById: user.id });
        Object.assign(row, defaults, override);
        row.isException = Object.keys(override).length > 0;
        row.source = source;
        const newNote = override.absenceReason !== undefined || defaults.absenceReason !== undefined;
        const msgs = normalize(row, s.allergies, wasAbsent && !newNote);
        if (msgs.length) warnings.push({ studentId: s.id, studentName: s.fullName, messages: msgs });
        return row;
      });

      const saved = await saveInOrder(repo, rows);
      return { saved, warnings };
    });
    return {
      classId: cls.id,
      date,
      total: result.saved.length,
      exceptions: result.saved.filter((r) => r.isException).length,
      absent: result.saved.filter((r) => r.attendance === AttendanceStatus.ABSENT).length,
      warnings: result.warnings,
      entries: result.saved,
    };
  }

  /** Create or edit one child's entry for a day. */
  async upsertOne(user: AuthUser, studentId: string, dto: UpsertJournalDto) {
    const student = await this.access.assertStudent(user, studentId);
    if (user.role === UserRole.PARENT) throw new ForbiddenException('Parents cannot edit journals');
    const date = this.resolveAttendanceDate(user, dto.date);

    const row =
      (await this.journals.findOne({ where: { studentId, journalDate: date } })) ??
      this.journals.create({
        studentId,
        classId: student.classId,
        journalDate: date,
        createdById: user.id,
        source: JournalSource.MANUAL,
      });
    const wasAbsent = row.attendance === AttendanceStatus.ABSENT;
    Object.assign(row, pickFields(dto));
    const warnings = normalize(row, student.allergies, wasAbsent && dto.absenceReason === undefined);
    const saved = await this.journals.save(row);
    return { ...saved, warnings };
  }

  async remove(user: AuthUser, id: string) {
    const entry = await this.findOne(user, id);
    if (user.role === UserRole.PARENT) throw new ForbiddenException('Parents cannot delete journals');
    this.resolveAttendanceDate(user, entry.journalDate);
    await this.journals.delete(id);
    return { success: true };
  }

  // ------------------------------------------------------------------ helpers

  activeStudents(classId: string) {
    return this.students.find({
      where: { classId, status: RecordStatus.ACTIVE },
      order: { fullName: 'ASC' },
    });
  }
}
