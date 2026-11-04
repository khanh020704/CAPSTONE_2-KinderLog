import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AnnouncementAudience, AnnouncementCategory, AnnouncementStatus } from '../../../common/enums';
import type { School } from '../../schools/entities/school.entity';
import type { User } from '../../users/entities/user.entity';

/** A notice from the school to its teachers and/or parents. Only PUBLISHED, unexpired notices reach them. */
@Entity('school_announcements')
@Index(['schoolId', 'status', 'publishedAt'])
export class SchoolAnnouncement extends BaseEntity {
  @Column({ name: 'school_id', type: 'uniqueidentifier' })
  schoolId: string;

  @ManyToOne('School', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  /** NULL once the author's account is deleted (the notice stays). */
  @Column({ name: 'created_by', type: 'uniqueidentifier', nullable: true })
  createdById: string | null;

  @ManyToOne('User', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ type: 'nvarchar', length: 200 })
  title: string;

  @Column({ type: 'nvarchar', length: 'MAX' })
  content: string;

  @Column({ type: 'simple-enum', enum: AnnouncementCategory, default: AnnouncementCategory.NOTICE })
  category: AnnouncementCategory;

  @Column({ type: 'simple-enum', enum: AnnouncementAudience, default: AnnouncementAudience.ALL })
  audience: AnnouncementAudience;

  @Column({ type: 'simple-enum', enum: AnnouncementStatus, default: AnnouncementStatus.DRAFT })
  status: AnnouncementStatus;

  /** When readers see it: set on publishing (now, or 00:00 of a later publish date chosen by the principal). */
  @Column({ name: 'published_at', type: 'datetime2', nullable: true })
  publishedAt: Date | null;

  /** When the audience was notified; NULL while a scheduled announcement has not been released yet. */
  @Column({ name: 'notified_at', type: 'datetime2', nullable: true })
  notifiedAt: Date | null;

  /** Last day it is shown (inclusive); NULL = no end. */
  @Column({ name: 'expires_on', type: 'date', nullable: true })
  expiresOn: string | null;
}
