import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditStatus } from '../../../common/enums';
import type { School } from '../../schools/entities/school.entity';
import type { User } from '../../users/entities/user.entity';

/**
 * Append-only trail of important actions. The actor's name and role are copied into the row, so the entry stays
 * readable after the account (user_id → NULL) or the school is deleted.
 */
@Entity('audit_logs')
@Index(['schoolId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2' })
  createdAt: Date;

  @Column({ name: 'user_id', type: 'uniqueidentifier', nullable: true })
  userId: string | null;

  @ManyToOne('User', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'school_id', type: 'uniqueidentifier', nullable: true })
  schoolId: string | null;

  @ManyToOne('School', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  @Column({ name: 'user_name', type: 'nvarchar', length: 120, nullable: true })
  userName: string | null;

  @Column({ name: 'user_role', type: 'nvarchar', length: 20, nullable: true })
  userRole: string | null;

  /** LOGIN, CREATE, UPDATE, DELETE, APPROVE, STATUS, RESET_PASSWORD, … */
  @Column({ type: 'nvarchar', length: 40 })
  action: string;

  /** Area of the app, e.g. "Classes", "Daily Journal" */
  @Column({ type: 'nvarchar', length: 60 })
  module: string;

  @Column({ type: 'nvarchar', length: 500 })
  description: string;

  @Column({ type: 'simple-enum', enum: AuditStatus })
  status: AuditStatus;

  @Column({ name: 'http_status', type: 'smallint', nullable: true })
  httpStatus: number | null;

  @Column({ name: 'ip_address', type: 'nvarchar', length: 45, nullable: true })
  ipAddress: string | null;
}
