import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import {
  AttendanceStatus,
  HealthStatus,
  JournalSource,
  JournalStatus,
  MealLevel,
  Mood,
  SleepQuality,
} from '../../../common/enums';
import type { ClassEntity } from '../../classes/entities/class.entity';
import type { Student } from '../../students/entities/student.entity';
import type { User } from '../../users/entities/user.entity';
import type { JournalPhoto } from './journal-photo.entity';

const numeric = { to: (v: number | null) => v, from: (v: string | null) => (v == null ? null : Number(v)) };

/**
 * One child, one day. `class_id` records the class the child was in on that day (a student can change class
 * later), so it is a fact of the entry and not derived from students.class_id.
 */
@Entity('daily_journals')
@Unique('uq_journal_student_date', ['studentId', 'journalDate'])
@Index('ix_journal_class_date', ['classId', 'journalDate'])
export class DailyJournal extends BaseEntity {
  @Column({ name: 'student_id', type: 'uniqueidentifier' })
  studentId: string;

  @ManyToOne('Student', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ name: 'class_id', type: 'uniqueidentifier' })
  classId: string;

  @ManyToOne('ClassEntity', { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column({ name: 'journal_date', type: 'date' })
  journalDate: string;

  @Column({ type: 'simple-enum', enum: AttendanceStatus, default: AttendanceStatus.PRESENT })
  attendance: AttendanceStatus;

  /** The attendance note: the reason when absent, or a note such as "arrived late" when present. */
  @Column({ name: 'absence_reason', type: 'nvarchar', length: 255, nullable: true })
  absenceReason: string | null;

  // ---- Meal ----
  @Column({ name: 'meal_level', type: 'simple-enum', enum: MealLevel, nullable: true })
  mealLevel: MealLevel | null;

  @Column({ name: 'meal_note', type: 'nvarchar', length: 'MAX', nullable: true })
  mealNote: string | null;

  // ---- Sleep ----
  @Column({ name: 'sleep_minutes', type: 'smallint', nullable: true })
  sleepMinutes: number | null;

  @Column({ name: 'sleep_quality', type: 'simple-enum', enum: SleepQuality, nullable: true })
  sleepQuality: SleepQuality | null;

  // ---- Learning ----
  @Column({ name: 'learning_note', type: 'nvarchar', length: 'MAX', nullable: true })
  learningNote: string | null;

  // ---- Health ----
  @Column({ name: 'health_status', type: 'simple-enum', enum: HealthStatus, nullable: true })
  healthStatus: HealthStatus | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true, transformer: numeric })
  temperature: number | null;

  @Column({ name: 'health_note', type: 'nvarchar', length: 'MAX', nullable: true })
  healthNote: string | null;

  // ---- Emotion & free note ----
  @Column({ type: 'simple-enum', enum: Mood, nullable: true })
  mood: Mood | null;

  @Column({ name: 'teacher_note', type: 'nvarchar', length: 'MAX', nullable: true })
  teacherNote: string | null;

  // ---- Workflow ----
  @Column({ type: 'simple-enum', enum: JournalStatus, default: JournalStatus.DRAFT })
  status: JournalStatus;

  @Column({ type: 'simple-enum', enum: JournalSource, default: JournalSource.MANUAL })
  source: JournalSource;

  /** True when this child differs from the class-wide bulk values (the "2-3 children" overrides). */
  @Column({ name: 'is_exception', default: false })
  isException: boolean;

  @Column({ name: 'created_by_id', type: 'uniqueidentifier', nullable: true })
  createdById: string | null;

  @ManyToOne('User', { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @Column({ name: 'approved_by_id', type: 'uniqueidentifier', nullable: true })
  approvedById: string | null;

  @ManyToOne('User', { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy: User | null;

  @Column({ name: 'approved_at', type: 'datetime2', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'submitted_at', type: 'datetime2', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'published_by_id', type: 'uniqueidentifier', nullable: true })
  publishedById: string | null;

  @ManyToOne('User', { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'published_by_id' })
  publishedBy: User | null;

  @Column({ name: 'published_at', type: 'datetime2', nullable: true })
  publishedAt: Date | null;

  @OneToMany('JournalPhoto', (p: JournalPhoto) => p.journal)
  photos: JournalPhoto[];
}
