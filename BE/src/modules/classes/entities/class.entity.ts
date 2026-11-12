import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { RecordStatus } from '../../../common/enums';
import type { School } from '../../schools/entities/school.entity';
import type { Student } from '../../students/entities/student.entity';
import type { User } from '../../users/entities/user.entity';

@Entity('classes')
@Unique('uq_class_name_per_year', ['schoolId', 'academicYear', 'name'])
export class ClassEntity extends BaseEntity {
  @Index()
  @Column({ name: 'school_id', type: 'uniqueidentifier' })
  schoolId: string;

  @ManyToOne('School', (s: School) => s.classes, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ length: 80 })
  name: string;

  /** e.g. "2026-2027" */
  @Column({ name: 'academic_year', length: 9 })
  academicYear: string;

  @Column({ name: 'age_group', type: 'nvarchar', length: 40, nullable: true })
  ageGroup: string | null;

  @Index()
  @Column({ name: 'homeroom_teacher_id', type: 'uniqueidentifier', nullable: true })
  homeroomTeacherId: string | null;

  @ManyToOne('User', { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'homeroom_teacher_id' })
  homeroomTeacher: User | null;

  @Column({ type: 'simple-enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status: RecordStatus;

  @OneToMany('Student', (s: Student) => s.class)
  students: Student[];
}
