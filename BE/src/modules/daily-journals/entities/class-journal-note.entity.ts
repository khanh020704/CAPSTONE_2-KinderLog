import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Student } from '../../students/entities/student.entity';
import type { ClassJournal } from './class-journal.entity';

/** A note about one child in a class journal, shown only to that child's parents. */
@Entity('class_journal_notes')
@Unique('uq_class_journal_note_student', ['journalId', 'studentId'])
export class ClassJournalNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'journal_id', type: 'uniqueidentifier' })
  journalId: string;

  @ManyToOne('ClassJournal', (j: ClassJournal) => j.personalNotes, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn({ name: 'journal_id' })
  journal: ClassJournal;

  @Index()
  @Column({ name: 'student_id', type: 'uniqueidentifier' })
  studentId: string;

  // NO ACTION: the class already cascades to the journal; deleting a student removes their notes in code.
  @ManyToOne('Student', { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'nvarchar', length: 'MAX' })
  content: string;
}
