import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Between, DataSource, In, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { AttendanceStatus, JournalSource, JournalStatus, RecordStatus, UserRole } from '../../common/enums';
import { addDays, isoDate } from '../../common/utils/date.util';
import { countWhere, isoDateSql } from '../../common/utils/sql.util';
import { AccessService } from '../access/access.service';
import { CacheService } from '../cache/cache.service';
import { Student } from '../students/entities/student.entity';
import {
  ApproveJournalsDto,
  BulkJournalDto,
  HistoryQueryDto,
  JournalFieldsDto,
  TimelineQueryDto,
  UploadPhotosDto,
  UpsertJournalDto,
} from './dto/journal.dto';
import { DailyJournal } from './entities/daily-journal.entity';
import { JournalPhoto } from './entities/journal-photo.entity';
import { normalize, pickFields } from './journal-fields';
import { buildTimeline } from './timeline';

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

@Injectable()
export class DailyJournalsService {
  private readonly tz: string;

  constructor(
    @InjectRepository(DailyJournal) private readonly journals: Repository<DailyJournal>,
    @InjectRepository(JournalPhoto) private readonly photos: Repository<JournalPhoto>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('timezone')!;
  }

  today() {
    return isoDate(this.tz);
  }

  /** Teachers log today or the past week only; principals may correct any past day. Never the future. */
  private resolveDate(user: AuthUser, date?: string): string {
    const today = this.today();
    const d = date ?? today;
    if (d > today) throw new BadRequestException('Journals cannot be written for a future date');
    if (user.role === UserRole.TEACHER && d < addDays(today, -7)) {
      throw new ForbiddenException('Teachers can only edit journals of the last 7 days');
    }
    return d;
  }

  // ------------------------------------------------------------------ read

  /** The class register for one day: every active child with their entry (or null) and a summary. */
  async classDay(user: AuthUser, classId: string, date?: string) {
    const cls = await this.access.assertClass(user, classId);
    const day = date ?? this.today();
    const [roster, entries] = await Promise.all([
      this.activeStudents(classId),
      this.journals.find({ where: { classId, journalDate: day }, relations: { photos: true } }),
    ]);
    const byStudent = new Map(entries.map((e) => [e.studentId, e]));
    const visible =
      user.role === UserRole.PARENT ? entries.filter((e) => e.status === JournalStatus.APPROVED) : entries;

    return {
      class: { id: cls.id, name: cls.name },
      date: day,
      summary: {
        total: roster.length,
        logged: entries.length,
        missing: roster.filter((s) => !byStudent.has(s.id)).length,
        present: entries.filter((e) => e.attendance === AttendanceStatus.PRESENT).length,
        absent: entries.filter((e) => e.attendance === AttendanceStatus.ABSENT).length,
        draft: entries.filter((e) => e.status === JournalStatus.DRAFT).length,
        approved: entries.filter((e) => e.status === JournalStatus.APPROVED).length,
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

  /** One row per day that has entries: what the teacher's "Journal history" list shows. */
  async history(user: AuthUser, classId: string, q: HistoryQueryDto) {
    await this.access.assertClass(user, classId);
    const to = q.to ?? this.today();
    const from = q.from ?? addDays(to, -30);
    const rows = await this.journals
      .createQueryBuilder('j')
      .select(isoDateSql('j.journal_date'), 'date')
      .addSelect('COUNT(*)', 'logged')
      .addSelect(countWhere(`j.status = 'APPROVED'`), 'approved')
      .addSelect(countWhere(`j.attendance = 'ABSENT'`), 'absent')
      .addSelect(`MAX(CASE WHEN j.source = 'VOICE' THEN 1 ELSE 0 END)`, 'voice')
      .addSelect('MAX(j.updated_at)', 'updatedAt')
      .where('j.class_id = :classId', { classId })
      .andWhere('j.journal_date BETWEEN :from AND :to', { from, to })
      .groupBy('j.journal_date')
      .orderBy('j.journal_date', 'DESC')
      .getRawMany<{
        date: string;
        logged: string;
        approved: string;
        absent: string;
        voice: number;
        updatedAt: Date;
      }>();
    return rows.map((r) => ({
      date: r.date,
      logged: Number(r.logged),
      approved: Number(r.approved),
      draft: Number(r.logged) - Number(r.approved),
      absent: Number(r.absent),
      voice: Number(r.voice) === 1,
      updatedAt: r.updatedAt,
    }));
  }

  /** Parent timeline (APPROVED only) – staff see drafts too. Newest day first, each day split into events. */
  async timeline(user: AuthUser, q: TimelineQueryDto) {
    const student = await this.access.assertStudent(user, q.studentId);
    const to = q.to ?? this.today();
    const from = q.from ?? addDays(to, -13);
    const entries = await this.journals.find({
      where: {
        studentId: q.studentId,
        journalDate: Between(from, to),
        ...(user.role === UserRole.PARENT && { status: JournalStatus.APPROVED }),
      },
      relations: { photos: true, createdBy: true },
      order: { journalDate: 'DESC', photos: { createdAt: 'ASC' } },
    });
    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        class: { id: student.class.id, name: student.class.name },
      },
      from,
      to,
      days: entries.map((e) => ({
        date: e.journalDate,
        status: e.status,
        approvedAt: e.approvedAt,
        teacher: e.createdBy?.fullName ?? null,
        events: buildTimeline(e),
        photos: e.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption })),
        journal: e,
      })),
    };
  }

  async findOne(user: AuthUser, id: string) {
    const entry = await this.journals.findOne({ where: { id }, relations: { photos: true, student: true } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    await this.access.assertStudent(user, entry.studentId);
    if (user.role === UserRole.PARENT && entry.status !== JournalStatus.APPROVED) {
      throw new NotFoundException('Journal entry not found');
    }
    return entry;
  }

  // ------------------------------------------------------------------ write

  /**
   * Bulk logging with exceptions. One transaction:
   *   entry = existing values ← class defaults ← this child's exception
   * Every touched entry goes back to DRAFT so nothing reaches parents without a fresh approval.
   */
  async bulkUpsert(user: AuthUser, dto: BulkJournalDto, source = dto.source ?? JournalSource.BULK) {
    const cls = await this.access.assertClassWritable(user, dto.classId);
    const date = this.resolveDate(user, dto.date);
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
        const row =
          existing.get(s.id) ??
          repo.create({ studentId: s.id, classId: cls.id, journalDate: date, createdById: user.id });
        Object.assign(row, defaults, override);
        row.isException = Object.keys(override).length > 0;
        row.source = source;
        this.markDraft(row);
        const msgs = normalize(row, s.allergies);
        if (msgs.length) warnings.push({ studentId: s.id, studentName: s.fullName, messages: msgs });
        return row;
      });

      const saved = await saveInOrder(repo, rows);
      return { saved, warnings };
    });

    await this.invalidate(cls.schoolId);
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
    const date = this.resolveDate(user, dto.date);

    const row =
      (await this.journals.findOne({ where: { studentId, journalDate: date } })) ??
      this.journals.create({
        studentId,
        classId: student.classId,
        journalDate: date,
        createdById: user.id,
        source: JournalSource.MANUAL,
      });
    Object.assign(row, pickFields(dto));
    this.markDraft(row);
    const warnings = normalize(row, student.allergies);
    const saved = await this.journals.save(row);
    await this.invalidate(student.class.schoolId);
    return { ...saved, warnings };
  }

  async approve(user: AuthUser, dto: ApproveJournalsDto) {
    const cls = await this.access.assertClassWritable(user, dto.classId);
    const date = dto.date ?? this.today();
    const res = await this.journals.update(
      {
        classId: cls.id,
        journalDate: date,
        status: JournalStatus.DRAFT,
        ...(dto.studentIds?.length && { studentId: In(dto.studentIds) }),
      },
      { status: JournalStatus.APPROVED, approvedById: user.id, approvedAt: new Date() },
    );
    await this.invalidate(cls.schoolId);
    return { classId: cls.id, date, approved: res.affected ?? 0 };
  }

  async remove(user: AuthUser, id: string) {
    const entry = await this.findOne(user, id);
    if (user.role === UserRole.PARENT) throw new ForbiddenException('Parents cannot delete journals');
    this.resolveDate(user, entry.journalDate);
    await this.journals.delete(id);
    return { success: true };
  }

  // ------------------------------------------------------------------ photos

  /**
   * One upload, many children: each file is stored once and linked to the entry of every child in it.
   * Missing entries are created as present DRAFTs so a photo is never orphaned.
   */
  async addPhotos(user: AuthUser, dto: UploadPhotosDto, files: Express.Multer.File[], publicPath: string) {
    if (!files?.length) throw new BadRequestException('Attach at least one image in the "photos" field');
    const cls = await this.access.assertClassWritable(user, dto.classId);
    const date = this.resolveDate(user, dto.date);
    const roster = await this.activeStudents(cls.id);
    const targetIds = dto.studentIds?.length ? dto.studentIds : roster.map((s) => s.id);
    const unknown = targetIds.filter((id) => !roster.some((s) => s.id === id));
    if (unknown.length) throw new BadRequestException(`Not in this class: ${unknown.join(', ')}`);

    return this.dataSource.transaction(async (tx) => {
      const jRepo = tx.getRepository(DailyJournal);
      const pRepo = tx.getRepository(JournalPhoto);
      const existing = await jRepo.find({
        where: { classId: cls.id, journalDate: date, studentId: In(targetIds) },
      });
      const byStudent = new Map(existing.map((e) => [e.studentId, e]));

      const entries: DailyJournal[] = [];
      for (const studentId of targetIds) {
        let e = byStudent.get(studentId);
        if (e?.attendance === AttendanceStatus.ABSENT && !dto.studentIds?.length) continue; // absent kids are not in class photos
        e ??= jRepo.create({ studentId, classId: cls.id, journalDate: date, createdById: user.id });
        this.markDraft(e);
        entries.push(e);
      }
      const saved = await saveInOrder(jRepo, entries);

      const photos = saved.flatMap((e) =>
        files.map((f) =>
          pRepo.create({
            journalId: e.id,
            url: `${publicPath}/${f.filename}`,
            caption: dto.caption ?? null,
            uploadedById: user.id,
          }),
        ),
      );
      await pRepo.save(photos);
      return {
        date,
        files: files.map((f) => `${publicPath}/${f.filename}`),
        linkedStudents: saved.map((e) => e.studentId),
      };
    });
  }

  async removePhoto(user: AuthUser, photoId: string, uploadDir: string) {
    const photo = await this.photos.findOne({ where: { id: photoId }, relations: { journal: true } });
    if (!photo) throw new NotFoundException('Photo not found');
    if (user.role === UserRole.PARENT) throw new ForbiddenException('Parents cannot delete photos');
    await this.access.assertStudent(user, photo.journal.studentId);
    await this.photos.delete(photoId);
    // The same file can be linked to several children; delete it from disk with the last link.
    if (!(await this.photos.exist({ where: { url: photo.url } })) && photo.url.startsWith('/uploads/')) {
      await fs.unlink(join(uploadDir, photo.url.replace(/^\/uploads\//, ''))).catch(() => undefined);
    }
    return { success: true };
  }

  // ------------------------------------------------------------------ helpers

  activeStudents(classId: string) {
    return this.students.find({
      where: { classId, status: RecordStatus.ACTIVE },
      order: { fullName: 'ASC' },
    });
  }

  private markDraft(row: DailyJournal) {
    row.status = JournalStatus.DRAFT;
    row.approvedById = null;
    row.approvedAt = null;
  }

  private invalidate(schoolId: string) {
    return this.cache.invalidate(`dash:${schoolId}`);
  }
}
