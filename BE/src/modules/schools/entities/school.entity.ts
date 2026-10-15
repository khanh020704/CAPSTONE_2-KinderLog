import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { RecordStatus } from '../../../common/enums';
import type { ClassEntity } from '../../classes/entities/class.entity';
import type { User } from '../../users/entities/user.entity';

/** Tenant root: every principal, teacher, parent and class belongs to exactly one school. */
@Entity('schools')
export class School extends BaseEntity {
  @Column({ length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  email: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @OneToMany('User', (u: User) => u.school)
  users: User[];

  @OneToMany('ClassEntity', (c: ClassEntity) => c.school)
  classes: ClassEntity[];
}
