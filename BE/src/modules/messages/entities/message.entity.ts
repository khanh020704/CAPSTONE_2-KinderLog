import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { User } from '../../users/entities/user.entity';

/**
 * A direct message. Both foreign keys are NO ACTION because SQL Server allows only one cascade path from `users`;
 * UsersService.remove() deletes the messages of an account in the same transaction.
 */
@Entity('messages')
@Index(['senderId', 'receiverId', 'createdAt'])
@Index(['receiverId', 'readAt'])
export class Message extends BaseEntity {
  @Column({ name: 'sender_id', type: 'uniqueidentifier' })
  senderId: string;

  @ManyToOne('User', { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'receiver_id', type: 'uniqueidentifier' })
  receiverId: string;

  @ManyToOne('User', { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'receiver_id' })
  receiver: User;

  @Column({ type: 'nvarchar', length: 2000 })
  content: string;

  @Column({ name: 'read_at', type: 'datetime2', nullable: true })
  readAt: Date | null;
}
