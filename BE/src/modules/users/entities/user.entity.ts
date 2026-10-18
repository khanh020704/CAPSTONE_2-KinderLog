import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { RecordStatus, UserRole } from '../../../common/enums';
import type { School } from '../../schools/entities/school.entity';

@Entity('users')
export class User extends BaseEntity {
  /** NULL only for SYSTEM_ADMIN, who works across all schools. */
  @Index()
  @Column({ name: 'school_id', type: 'uniqueidentifier', nullable: true })
  schoolId: string | null;

  @ManyToOne('School', (s: School) => s.users, { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  /** Login identifier, as in the FE (Vietnamese mobile number). */
  @Index({ unique: true })
  @Column({ length: 20 })
  phone: string;

  @Column({ type: 'nvarchar', length: 120, nullable: true })
  email: string | null;

  @Column({ name: 'password_hash', length: 100, select: false })
  passwordHash: string;

  @Column({ type: 'simple-enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'simple-enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  address: string | null;

  @Column({ name: 'last_login_at', type: 'datetime2', nullable: true })
  lastLoginAt: Date | null;
}
