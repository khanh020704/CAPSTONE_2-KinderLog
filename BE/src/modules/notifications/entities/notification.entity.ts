import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationType } from '../../../common/enums';
import type { User } from '../../users/entities/user.entity';

/** One notification for one user. Deleted with the user. */
@Entity('notifications')
@Index(['userId', 'readAt'])
@Index(['userId', 'createdAt'])
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'uniqueidentifier' })
  userId: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'simple-enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'nvarchar', length: 200 })
  title: string;

  @Column({ type: 'nvarchar', length: 1000, nullable: true })
  body: string | null;

  /** FE route to open, e.g. /parent/messages */
  @Column({ type: 'nvarchar', length: 300, nullable: true })
  link: string | null;

  /** What it is about (message sender, announcement, journal…): unread notifications about the same thing are merged. */
  @Column({ name: 'ref_id', type: 'uniqueidentifier', nullable: true })
  refId: string | null;

  @Column({ name: 'read_at', type: 'datetime2', nullable: true })
  readAt: Date | null;
}
