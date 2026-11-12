import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { AcademicYear } from './academic-year.entity';

/**
 * A semester (học kỳ) of an academic year, e.g. "Học kỳ 1". Its dates lie inside the year's dates and never overlap
 * another semester of the same year (checked by the service).
 */
@Entity('semesters')
@Index(['academicYearId', 'name'], { unique: true })
export class Semester extends BaseEntity {
  @Column({ name: 'academic_year_id', type: 'uniqueidentifier' })
  academicYearId: string;

  @ManyToOne('AcademicYear', 'semesters', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'nvarchar', length: 50 })
  name: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;
}
