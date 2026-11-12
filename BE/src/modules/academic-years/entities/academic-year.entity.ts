import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AcademicYearStatus } from '../../../common/enums';
import type { School } from '../../schools/entities/school.entity';
import type { Semester } from './semester.entity';

/**
 * A school's academic year. `name` ("2026-2027") is the value classes store in `classes.academic_year`.
 * At most one ACTIVE year per school (the current one); the service deactivates the previous one.
 */
@Entity('academic_years')
@Index(['schoolId', 'name'], { unique: true })
export class AcademicYear extends BaseEntity {
  @Column({ name: 'school_id', type: 'uniqueidentifier' })
  schoolId: string;

  @ManyToOne('School', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'nvarchar', length: 9 })
  name: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'simple-enum', enum: AcademicYearStatus, default: AcademicYearStatus.INACTIVE })
  status: AcademicYearStatus;

  @OneToMany('Semester', 'academicYear')
  semesters: Semester[];
}
