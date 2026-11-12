import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { User } from '../../users/entities/user.entity';
import type { DailyJournal } from './daily-journal.entity';

@Entity('journal_photos')
export class JournalPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'journal_id', type: 'uniqueidentifier' })
  journalId: string;

  @ManyToOne('DailyJournal', (j: DailyJournal) => j.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal: DailyJournal;

  /** Public path served by the API (e.g. /uploads/photos/abc.jpg) or an absolute URL. */
  @Column({ length: 500 })
  url: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  caption: string | null;

  @Column({ name: 'uploaded_by_id', type: 'uniqueidentifier', nullable: true })
  uploadedById: string | null;

  @ManyToOne('User', { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2' })
  createdAt: Date;
}
