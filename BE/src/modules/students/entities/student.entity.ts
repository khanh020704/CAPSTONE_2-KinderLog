import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Gender, RecordStatus } from '../../../common/enums';
import type { ClassEntity } from '../../classes/entities/class.entity';
import type { ParentStudentMap } from './parent-student-map.entity';

/** The school is reached through the class (3NF: no duplicated school_id). */
@Entity('students')
export class Student extends BaseEntity {
  @Index()
  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  @ManyToOne('ClassEntity', (c: ClassEntity) => c.students, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: string;

  @Column({ type: 'enum', enum: Gender })
  gender: Gender;

  /** Free text the teacher must see at every meal, e.g. "Dị ứng tôm, đậu phộng". */
  @Column({ type: 'text', nullable: true })
  allergies: string | null;

  @Column({ name: 'medical_note', type: 'text', nullable: true })
  medicalNote: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @OneToMany('ParentStudentMap', (m: ParentStudentMap) => m.student)
  parentLinks: ParentStudentMap[];
}
