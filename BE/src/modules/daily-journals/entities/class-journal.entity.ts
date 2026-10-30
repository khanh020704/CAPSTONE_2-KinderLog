import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ClassJournalStatus, JournalSource } from '../../../common/enums';
import type { ReviewIssue } from '../ai/journal-review';
import type { ClassEntity } from '../../classes/entities/class.entity';
import type { User } from '../../users/entities/user.entity';
import type { ClassJournalNote } from './class-journal-note.entity';

/** JSON kept in an nvarchar(MAX) column; a value left unset is saved as `empty`. */
const json = <T>(empty: T) => ({
  to: (v: T | null | undefined) =>
    v == null ? (empty == null ? null : JSON.stringify(empty)) : JSON.stringify(v),
  // TypeORM also passes back the value it has just saved (already parsed) for columns with a default.
  from: (v: unknown) => (typeof v === 'string' ? (v ? (JSON.parse(v) as T) : empty) : ((v as T) ?? empty)),
});

/** What parents see: the content as last published, apart from the teacher's working copy. */
export interface PublishedVersion {
  sections: Record<string, string>;
  personal: Record<string, string>;
  photos: string[];
  publishedAt: string;
}

/**
 * The class journal of one day (one per class and day): six sections every parent of the class reads, plus a
 * private note per child (class_journal_notes) that only that child's parents read.
 * Workflow: DRAFT (written by hand) or REVIEW (made from a recording) → APPROVED → PUBLISHED. A published journal can
 * still be changed: it goes back to DRAFT / REVIEW and parents keep seeing `publishedVersion` until it is approved and
 * published again.
 */
@Entity('class_journals')
@Unique('uq_class_journal_class_date', ['classId', 'journalDate'])
export class ClassJournal extends BaseEntity {
  @Column({ name: 'class_id', type: 'uniqueidentifier' })
  classId: string;

  @ManyToOne('ClassEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column({ name: 'journal_date', type: 'date' })
  journalDate: string;

  // ---- The six sections shared with the whole class ----
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  meal: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  learning: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  sleep: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  health: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  emotion: string | null;

  /** Ghi chú đặc biệt: reminders and notes for every parent of the class. */
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  note: string | null;

  @OneToMany('ClassJournalNote', (n: ClassJournalNote) => n.journal, { cascade: true })
  personalNotes: ClassJournalNote[];

  /** Photo addresses (/uploads/photos/…), shared with the whole class. */
  @Column({ type: 'nvarchar', length: 'MAX', transformer: json<string[]>([]), default: '[]' })
  photos: string[];

  // ---- Voice ----
  @Column({ type: 'simple-enum', enum: JournalSource, default: JournalSource.MANUAL })
  source: JournalSource;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  transcript: string | null;

  @Column({
    name: 'audio_urls',
    type: 'nvarchar',
    length: 'MAX',
    transformer: json<string[]>([]),
    default: '[]',
  })
  audioUrls: string[];

  /** Points of a voice draft the teacher must confirm before approving. */
  @Column({ type: 'nvarchar', length: 'MAX', transformer: json<ReviewIssue[]>([]), default: '[]' })
  issues: ReviewIssue[];

  // ---- Workflow ----
  @Column({ type: 'simple-enum', enum: ClassJournalStatus, default: ClassJournalStatus.DRAFT })
  status: ClassJournalStatus;

  @Column({ name: 'approved_at', type: 'datetime2', nullable: true })
  approvedAt: Date | null;

  /** When it was first published. */
  @Column({ name: 'published_at', type: 'datetime2', nullable: true })
  publishedAt: Date | null;

  /** How many times it has been published (0 = never: parents do not see it). */
  @Column({ type: 'int', default: 0 })
  revision: number;

  @Column({
    name: 'published_version',
    type: 'nvarchar',
    length: 'MAX',
    nullable: true,
    transformer: json<PublishedVersion | null>(null),
  })
  publishedVersion: PublishedVersion | null;

  @Column({ name: 'created_by_id', type: 'uniqueidentifier', nullable: true })
  createdById: string | null;

  @ManyToOne('User', { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @Column({ name: 'updated_by_id', type: 'uniqueidentifier', nullable: true })
  updatedById: string | null;

  @ManyToOne('User', { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy: User | null;
}
