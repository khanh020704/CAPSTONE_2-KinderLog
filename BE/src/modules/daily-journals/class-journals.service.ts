import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, MoreThan, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import {
  AttendanceStatus,
  ClassJournalStatus,
  JournalSource,
  NotificationType,
  RecordStatus,
  UserRole,
} from '../../common/enums';
import { addDays } from '../../common/utils/date.util';
import { AccessService } from '../access/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ParentStudentMap } from '../students/entities/parent-student-map.entity';
import { emptySections, PersonalNotes, SECTION_KEYS, Sections } from './ai/journal-draft.schema';
import { HOLDING_TYPES, ISSUE_TYPES, RESOLUTIONS, ReviewIssue } from './ai/journal-review';
import { joinNew, joinText, withoutSentence } from './ai/journal-text';
import { DailyJournalsService } from './daily-journals.service';
import {
  AddRecordingDto,
  CreateClassJournalDto,
  JournalListQueryDto,
  MAX_TEXT,
  SectionsDto,
  UpdateClassJournalDto,
} from './dto/class-journal.dto';
import { TimelineQueryDto } from './dto/journal.dto';
import { ClassJournal, PublishedVersion } from './entities/class-journal.entity';
import { ClassJournalNote } from './entities/class-journal-note.entity';
import { DailyJournal } from './entities/daily-journal.entity';
import type { TimelineEvent } from './timeline';

const lower = (s: string) => s.toLowerCase();
const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

const sectionsOf = (j: Pick<ClassJournal, (typeof SECTION_KEYS)[number]>): Sections =>
  Object.fromEntries(SECTION_KEYS.map((k) => [k, j[k] ?? ''])) as Sections;
const personalOf = (j: ClassJournal): PersonalNotes =>
  Object.fromEntries((j.personalNotes ?? []).map((n) => [n.studentId, n.content]));

const ISSUE_ID = /^iss_[0-9a-f]{6,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (value: unknown) =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && UUID.test(id)) : [];
const short = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Issues as POST /class-journals/voice-draft returned them, sent back when the draft is saved. */
function readIssues(value: unknown[] | undefined): ReviewIssue[] {
  return (value ?? []).map((raw, index) => {
    const i = isObj(raw) ? raw : {};
    const type = i.type as ReviewIssue['type'];
    const section = i.section as ReviewIssue['section'];
    if (
      typeof i.id !== 'string' ||
      !ISSUE_ID.test(i.id) ||
      !ISSUE_TYPES.includes(type) ||
      !SECTION_KEYS.includes(section) ||
      typeof i.message !== 'string'
    ) {
      throw new BadRequestException(`issues.${index}: send the issues as the voice draft returned them`);
    }
    return {
      id: i.id,
      type,
      section,
      text: short(i.text, MAX_TEXT),
      previousText: type === 'correction' ? short(i.previousText, MAX_TEXT) || null : null,
      message: short(i.message, 500),
      spokenNames: Array.isArray(i.spokenNames)
        ? i.spokenNames.filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 200))
        : [],
      candidates: ids(i.candidates),
      studentIds: ids(i.studentIds),
      held: i.held === true || HOLDING_TYPES.has(type),
      status: 'open',
      resolution: null,
      assignedTo: [],
    };
  });
}

interface Decision {
  id: string;
  status: 'open' | 'resolved';
  resolution: ReviewIssue['resolution'];
  assignedTo: string[];
}
function readDecisions(value: unknown[] | undefined): Decision[] {
  return (value ?? []).filter(isObj).map((d) => ({
    id: String(d.id),
    status: d.status === 'open' ? 'open' : 'resolved',
    resolution: RESOLUTIONS.includes(d.resolution as never) ? (d.resolution as Decision['resolution']) : null,
    assignedTo: ids(d.assignedTo),
  }));
}

/**
 * The class journal (Daily Journal): one per class and day, written by the class's teacher (or the principal).
 * DRAFT (manual) or REVIEW (voice) → APPROVED → PUBLISHED. Only a published version ever reaches parents.
 */
@Injectable()
export class ClassJournalsService {
  constructor(
    @InjectRepository(ClassJournal) private readonly repo: Repository<ClassJournal>,
    @InjectRepository(ParentStudentMap) private readonly links: Repository<ParentStudentMap>,
    @InjectRepository(DailyJournal) private readonly entries: Repository<DailyJournal>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly journals: DailyJournalsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ responses

  private listItem(j: ClassJournal) {
    return {
      id: j.id,
      classId: j.classId,
      date: j.journalDate,
      status: lower(j.status),
      source: j.source === JournalSource.VOICE ? 'voice' : 'manual',
      updatedAt: ms(j.updatedAt),
      publishedAt: ms(j.publishedAt),
      revision: j.revision,
      // Published before, edited since: parents still see the published version.
      unpublishedChanges: j.revision > 0 && j.status !== ClassJournalStatus.PUBLISHED,
      editedAt: j.revision > 1 ? ms(j.publishedVersion?.publishedAt) : null,
    };
  }

  /** The teacher's full view, including every personal note, the transcript and the recordings. */
  private full(j: ClassJournal) {
    return {
      ...this.listItem(j),
      sections: sectionsOf(j),
      personal: personalOf(j),
      photos: j.photos,
      transcript: j.transcript ?? '',
      audio: j.audioUrls,
      issues: j.issues,
    };
  }

  // ------------------------------------------------------------------ read

  async list(user: AuthUser, q: JournalListQueryDto) {
    await this.access.assertClass(user, q.classId);
    const status =
      q.status === 'review'
        ? In([ClassJournalStatus.REVIEW, ClassJournalStatus.APPROVED])
        : q.status
          ? (q.status.toUpperCase() as ClassJournalStatus)
          : undefined;
    const rows = await this.repo.find({
      where: { classId: q.classId, ...(q.date && { journalDate: q.date }), ...(status && { status }) },
      order: { journalDate: 'DESC' },
    });
    return { items: rows.map((j) => this.listItem(j)) };
  }

  async get(user: AuthUser, id: string) {
    return this.full(await this.require(user, id, false));
  }

  /** What a journal says now, for checking a further recording against it. */
  async existing(user: AuthUser, classId: string, id: string) {
    const j = await this.require(user, id, true);
    if (j.classId !== classId) throw new NotFoundException('Journal not found');
    return { sections: sectionsOf(j), personal: personalOf(j), date: j.journalDate };
  }

  // ------------------------------------------------------------------ write

  async create(user: AuthUser, dto: CreateClassJournalDto) {
    const cls = await this.access.assertClassWritable(user, dto.classId);
    const date = this.journals.resolveDate(user, dto.date);
    const voice = dto.source === 'voice';
    const personal = await this.checkPersonal(cls.id, dto.personal);
    if (await this.repo.exist({ where: { classId: cls.id, journalDate: date } })) {
      throw new ConflictException('This class already has a journal for that day.');
    }
    const active = new Set((await this.journals.activeStudents(cls.id)).map((s) => s.id));
    const j = this.repo.create({
      classId: cls.id,
      journalDate: date,
      createdById: user.id,
      updatedById: user.id,
      status: voice ? ClassJournalStatus.REVIEW : ClassJournalStatus.DRAFT,
      source: voice ? JournalSource.VOICE : JournalSource.MANUAL,
      transcript: voice ? dto.transcript?.trim() || null : null,
      audioUrls: voice ? (dto.audio ?? []) : [],
      issues: voice ? readIssues(dto.issues).map((i) => this.keepInClass(i, active)) : [],
      photos: [],
    });
    this.setContent(j, this.readSections(dto.sections), personal);
    try {
      return this.full(await this.repo.save(j));
    } catch (err) {
      if (/uq_class_journal_class_date|UNIQUE KEY/i.test(String((err as Error).message))) {
        throw new ConflictException('This class already has a journal for that day.');
      }
      throw err;
    }
  }

  /** Saves the draft. Anything changed after approval or publishing has to be approved again. */
  async update(user: AuthUser, id: string, dto: UpdateClassJournalDto) {
    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(ClassJournal);
      const j = await this.require(user, id, true, repo);
      const sections = dto.sections ? this.readSections(dto.sections) : sectionsOf(j);
      const personal = dto.personal ? await this.checkPersonal(j.classId, dto.personal) : personalOf(j);
      const photos = dto.photos ?? j.photos;
      const before = JSON.stringify([sectionsOf(j), personalOf(j), j.photos, j.issues]);

      if (dto.issues) {
        const active = new Set((await this.journals.activeStudents(j.classId)).map((s) => s.id));
        this.decide(j, readDecisions(dto.issues), active);
      }
      const changed = JSON.stringify([sections, personal, photos, j.issues]) !== before;
      this.setContent(j, sections, personal);
      j.photos = photos;
      j.updatedById = user.id;
      // A published journal goes back to draft / review the same way; parents keep its published version meanwhile.
      if (changed && [ClassJournalStatus.APPROVED, ClassJournalStatus.PUBLISHED].includes(j.status)) {
        j.status = this.unapproved(j);
        j.approvedAt = null;
      }
      await tx.getRepository(ClassJournalNote).delete({ journalId: j.id });
      return this.full(await repo.save(j));
    });
  }

  async approve(user: AuthUser, id: string) {
    const j = await this.require(user, id, true);
    if (j.status === ClassJournalStatus.PUBLISHED) {
      throw new ConflictException(
        'This journal is already published. Change it first, then approve the changes.',
      );
    }
    // Nothing the teacher has not confirmed can reach parents.
    const open = j.issues.filter((i) => i.status === 'open').length;
    if (open) {
      throw new ConflictException(
        `${open} ${open === 1 ? 'point still needs' : 'points still need'} your confirmation before approving.`,
      );
    }
    const hasContent = SECTION_KEYS.some((k) => j[k]?.trim()) || (j.personalNotes ?? []).length > 0;
    if (!hasContent) throw new ConflictException('Add content to at least one section before approving.');
    if (j.status === ClassJournalStatus.APPROVED) return this.full(j);
    j.status = ClassJournalStatus.APPROVED;
    j.approvedAt = new Date();
    j.updatedById = user.id;
    return this.full(await this.repo.save(j));
  }

  /**
   * Makes the journal visible to parents and tells them. Publishing a change replaces the version parents see and is
   * announced only to the parents it concerns: the whole class for a section or a photo, a child's parents for that
   * child's note.
   */
  async publish(user: AuthUser, id: string) {
    const j = await this.require(user, id, true);
    if (j.status !== ClassJournalStatus.APPROVED) {
      throw new ConflictException(
        j.status === ClassJournalStatus.PUBLISHED
          ? 'This journal is already published.'
          : 'Approve the journal before publishing it.',
      );
    }
    const previous = j.publishedVersion;
    const now = new Date();
    j.publishedVersion = {
      sections: sectionsOf(j),
      personal: personalOf(j),
      photos: [...j.photos],
      publishedAt: now.toISOString(),
    };
    j.revision += 1;
    j.status = ClassJournalStatus.PUBLISHED;
    j.publishedAt ??= now;
    j.updatedById = user.id;
    // Only one request moves it from APPROVED: a second click (or a second device) is refused instead of publishing
    // again and notifying parents twice.
    const moved = await this.repo.update(
      { id: j.id, status: ClassJournalStatus.APPROVED },
      {
        status: j.status,
        revision: j.revision,
        publishedAt: j.publishedAt,
        publishedVersion: j.publishedVersion,
        updatedById: user.id,
      },
    );
    if (!moved.affected) throw new ConflictException('This journal is already published.');
    await this.announce(j, previous);
    return this.full(j);
  }

  /** Another recording: its text is added to the draft (corrected statements are replaced) and goes back to review. */
  async addRecording(user: AuthUser, id: string, dto: AddRecordingDto) {
    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(ClassJournal);
      const j = await this.require(user, id, true, repo);
      const added = readIssues(dto.issues).filter((i) => !j.issues.some((k) => k.id === i.id));
      const personal = await this.checkPersonal(j.classId, dto.personal);
      const sections = this.readSections(dto.sections);
      const current = { sections: sectionsOf(j), personal: personalOf(j) };
      for (const fix of added.filter((i) => i.type === 'correction' && i.previousText)) {
        const [childId] = fix.studentIds;
        if (childId && current.personal[childId] != null) {
          current.personal[childId] = withoutSentence(current.personal[childId], fix.previousText!);
        } else if (!childId) {
          current.sections[fix.section] = withoutSentence(current.sections[fix.section], fix.previousText!);
        }
      }
      const notes: PersonalNotes = { ...current.personal };
      for (const [sid, text] of Object.entries(personal)) notes[sid] = joinNew(current.personal[sid], text);
      this.setContent(
        j,
        Object.fromEntries(
          SECTION_KEYS.map((k) => [k, joinNew(current.sections[k], sections[k])]),
        ) as Sections,
        // A note left empty by a correction is no note.
        Object.fromEntries(Object.entries(notes).filter(([, text]) => text.trim())),
      );
      const active = new Set((await this.journals.activeStudents(j.classId)).map((s) => s.id));
      j.transcript = joinText(j.transcript, dto.transcript) || null;
      if (dto.audioUrl) j.audioUrls = [...j.audioUrls, dto.audioUrl];
      j.issues = [...j.issues, ...added.map((i) => this.keepInClass(i, active))];
      j.source = JournalSource.VOICE;
      j.status = ClassJournalStatus.REVIEW;
      j.approvedAt = null;
      j.updatedById = user.id;
      await tx.getRepository(ClassJournalNote).delete({ journalId: j.id });
      return this.full(await repo.save(j));
    });
  }

  // ------------------------------------------------------------------ parents

  /**
   * A child's days, as GET /daily-journals/timeline returns them: the class journal as last published (never a
   * working copy), with only this child's own note, and the child's attendance of that day. Staff see the same.
   */
  async timeline(user: AuthUser, q: TimelineQueryDto) {
    const student = await this.access.assertStudent(user, q.studentId);
    const to = q.to ?? this.journals.today();
    const from = q.from ?? addDays(to, -13);
    // The child's own entries record the class they were in each day: a child who changed class sees the journals of
    // the class they were in then, never those of the new class from before they joined it. A day without an entry
    // (a weekend, attendance not taken) belongs to the class of the entry before it; after the last entry, to the
    // child's current class.
    const known = await this.entries.find({
      where: { studentId: student.id, journalDate: Between(addDays(from, -60), to) },
      select: { journalDate: true, classId: true, attendance: true, absenceReason: true },
      order: { journalDate: 'ASC' },
    });
    const attendance = known.filter((a) => a.journalDate >= from);
    const classOnDay = (date: string) => {
      const before = known.filter((a) => a.journalDate <= date);
      if (!before.length) return known[0]?.classId ?? student.classId;
      return before.length === known.length && before[before.length - 1].journalDate < date
        ? student.classId
        : before[before.length - 1].classId;
    };
    const classIds = [...new Set([student.classId, ...known.map((a) => a.classId)].filter(Boolean))];
    const days = classIds.length
      ? (
          await this.repo.find({
            where: { classId: In(classIds), journalDate: Between(from, to), revision: MoreThan(0) },
            relations: { createdBy: true },
            order: { journalDate: 'DESC' },
          })
        ).filter((j) => classOnDay(j.journalDate) === j.classId)
      : [];
    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        class: student.class ? { id: student.class.id, name: student.class.name } : null,
      },
      from,
      to,
      days: days.map((j) => {
        const v = j.publishedVersion!;
        const a = attendance.find((x) => x.journalDate === j.journalDate);
        return {
          id: j.id,
          date: j.journalDate,
          status: 'PUBLISHED',
          publishedAt: v.publishedAt,
          editedAt: j.revision > 1 ? v.publishedAt : null,
          teacher: j.createdBy?.fullName ?? null,
          sections: v.sections,
          personalNote: v.personal[student.id] ?? '',
          attendance: a ? { status: a.attendance, note: a.absenceReason ?? '' } : null,
          events: this.events(v, student.id, a),
          photos: v.photos.map((url, i) => ({ id: `${j.id}-${i}`, url, caption: null })),
        };
      }),
    };
  }

  /** Same order and times as the FE (JOURNAL_SECTIONS); the note about this child comes last. */
  private events(
    v: PublishedVersion,
    studentId: string,
    a?: Pick<DailyJournal, 'attendance' | 'absenceReason'>,
  ) {
    const events: TimelineEvent[] = [];
    if (a?.attendance === AttendanceStatus.ABSENT) {
      events.push({
        key: 'attendance',
        time: null,
        title: 'Vắng mặt',
        text: a.absenceReason || 'Bé nghỉ học hôm nay',
      });
    } else if (a) {
      events.push({ key: 'attendance', time: '07:45', title: 'Đến lớp', text: 'Bé đã đến lớp an toàn.' });
    }
    const push = (key: TimelineEvent['key'], time: string | null, title: string, text?: string) =>
      text?.trim() && events.push({ key, time, title, text });
    push('learning', '09:30', 'Hoạt động học', v.sections.learning);
    push('meal', '11:30', 'Bữa trưa', v.sections.meal);
    push('sleep', '13:00', 'Ngủ trưa', v.sections.sleep);
    push('health', null, 'Sức khỏe', v.sections.health);
    push('emotion', null, 'Cảm xúc', v.sections.emotion);
    push('classNote', null, 'Ghi chú của cô', v.sections.note);
    push('note', null, 'Riêng về bé', v.personal[studentId]);
    return events;
  }

  // ------------------------------------------------------------------ helpers

  private unapproved(j: ClassJournal) {
    return j.source === JournalSource.VOICE ? ClassJournalStatus.REVIEW : ClassJournalStatus.DRAFT;
  }

  private async require(user: AuthUser, id: string, write: boolean, repo = this.repo) {
    const j = await repo.findOne({ where: { id }, relations: { personalNotes: true } });
    if (!j) throw new NotFoundException('Journal not found');
    if (user.role === UserRole.PARENT) throw new NotFoundException('Journal not found');
    if (write) {
      await this.access.assertClassWritable(user, j.classId);
      this.journals.resolveDate(user, j.journalDate);
    } else {
      await this.access.assertClass(user, j.classId);
    }
    return j;
  }

  private readSections(dto?: SectionsDto): Sections {
    const out = emptySections();
    for (const k of SECTION_KEYS) out[k] = dto?.[k]?.trim() ?? '';
    return out;
  }

  /** A personal note may only be about an active child of the class; empty notes are dropped. */
  private async checkPersonal(classId: string, personal?: Record<string, unknown>): Promise<PersonalNotes> {
    if (!personal) return {};
    const active = new Set((await this.journals.activeStudents(classId)).map((s) => s.id));
    const out: PersonalNotes = {};
    for (const [studentId, text] of Object.entries(personal)) {
      if (typeof text !== 'string') throw new BadRequestException(`personal.${studentId}: enter text`);
      if (text.length > MAX_TEXT) {
        throw new BadRequestException(`personal.${studentId}: keep this note under ${MAX_TEXT} characters`);
      }
      if (!active.has(studentId)) {
        throw new BadRequestException('Some personal notes are about children who are not in this class.');
      }
      if (text.trim()) out[studentId] = text.trim();
    }
    return out;
  }

  private setContent(j: ClassJournal, sections: Sections, personal: PersonalNotes) {
    for (const k of SECTION_KEYS) j[k] = sections[k] || null;
    j.personalNotes = Object.entries(personal).map(([studentId, content]) =>
      Object.assign(new ClassJournalNote(), { studentId, content, journalId: j.id }),
    );
  }

  /** Ids an issue may point at: active children of the class only. */
  private keepInClass(issue: ReviewIssue, active: Set<string>): ReviewIssue {
    return {
      ...issue,
      candidates: issue.candidates.filter((id) => active.has(id)),
      studentIds: issue.studentIds.filter((id) => active.has(id)),
      assignedTo: issue.assignedTo.filter((id) => active.has(id)),
    };
  }

  /**
   * The teacher's decisions, by issue id. A held statement is assigned to children, kept for the whole class, or left
   * out; anything else is confirmed. Decisions about unknown ids are ignored.
   */
  private decide(j: ClassJournal, decisions: Decision[], active: Set<string>) {
    j.issues = j.issues.map((issue) => {
      const d = decisions.find((x) => x.id === issue.id);
      if (!d) return issue;
      if (d.status === 'open') return { ...issue, status: 'open', resolution: null, assignedTo: [] };
      const allowed: string[] = issue.held
        ? ['assigned', 'class', 'discarded']
        : issue.type === 'correction' && issue.previousText
          ? ['confirmed', 'reverted']
          : ['confirmed'];
      if (!d.resolution || !allowed.includes(d.resolution)) {
        throw new BadRequestException(
          issue.held
            ? 'Choose a child, keep it for the whole class, or leave it out.'
            : 'Confirm that you have checked this.',
        );
      }
      const assignedTo = d.assignedTo.filter((id) => active.has(id));
      if (d.resolution === 'assigned' && !assignedTo.length)
        throw new BadRequestException('Choose a child of this class.');
      return {
        ...issue,
        status: 'resolved',
        resolution: d.resolution,
        assignedTo: d.resolution === 'assigned' ? assignedTo : [],
      };
    });
  }

  private async announce(j: ClassJournal, previous: PublishedVersion | null) {
    const roster = await this.journals.activeStudents(j.classId);
    const links = roster.length
      ? await this.links.find({
          where: {
            studentId: In(roster.map((s) => s.id)),
            status: RecordStatus.ACTIVE,
            parent: { status: RecordStatus.ACTIVE },
          },
          select: { studentId: true, parentId: true },
          relations: { parent: true },
        })
      : [];
    const parentsOf = (studentId: string) =>
      links.filter((l) => l.studentId === studentId).map((l) => l.parentId);
    const everyone = links.map((l) => l.parentId);
    const link = `/parent/journal?date=${j.journalDate}`;
    const notify = (to: string[], title: string, body: string) =>
      this.notifications.notify(to, { type: NotificationType.JOURNAL, title, body, link, refId: j.id });
    const v = j.publishedVersion!;

    if (!previous) {
      await notify(
        everyone,
        'New journal published',
        `The daily journal of ${j.journalDate} is ready to view.`,
      );
      // A note about one child is announced to that child's parents only.
      for (const s of roster.filter((x) => v.personal[x.id])) {
        await notify(
          parentsOf(s.id),
          `A note about ${s.fullName}`,
          "The teacher wrote a personal note in today's journal.",
        );
      }
      return;
    }
    // A published change is announced only to the parents it concerns.
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(previous.sections, v.sections) || !same(previous.photos, v.photos)) {
      await notify(everyone, 'Journal updated', `The teacher updated the journal of ${j.journalDate}.`);
    }
    for (const s of roster.filter((x) => (previous.personal[x.id] ?? '') !== (v.personal[x.id] ?? ''))) {
      await notify(
        parentsOf(s.id),
        `Note about ${s.fullName} updated`,
        `The teacher changed the personal note in the journal of ${j.journalDate}.`,
      );
    }
  }
}
