import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Relationship } from '../../../common/enums';
import type { User } from '../../users/entities/user.entity';
import type { Student } from './student.entity';

/** N-N between PARENT users and students. Composite key, no surrogate id. */
@Entity('parent_student_map')
export class ParentStudentMap {
  @PrimaryColumn({ name: 'parent_id', type: 'uniqueidentifier' })
  parentId: string;

  @Index()
  @PrimaryColumn({ name: 'student_id', type: 'uniqueidentifier' })
  studentId: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent: User;

  @ManyToOne('Student', (s: Student) => s.parentLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'simple-enum', enum: Relationship })
  relationship: Relationship;

  /** The contact the school calls first. */
  @Column({ name: 'is_primary', default: false })
  isPrimary: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2' })
  createdAt: Date;
}
