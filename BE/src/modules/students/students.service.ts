import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus, UserRole } from '../../common/enums';
import { foldSearch, likeFolded } from '../../common/utils/sql.util';
import { AccessService } from '../access/access.service';
import { ClassJournalNote } from '../daily-journals/entities/class-journal-note.entity';
import { MediaStorageService } from '../storage/media-storage.service';
import { User } from '../users/entities/user.entity';
import { CreateStudentDto, LinkParentDto, ListStudentsQueryDto, UpdateStudentDto } from './dto/student.dto';
import { ParentStudentMap } from './entities/parent-student-map.entity';
import { Student } from './entities/student.entity';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(ParentStudentMap) private readonly links: Repository<ParentStudentMap>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessService,
    private readonly media: MediaStorageService,
  ) {}

  async list(user: AuthUser, q: ListStudentsQueryDto) {
    if (q.classId) await this.access.assertClass(user, q.classId);
    const schoolId = this.access.schoolOf(user);
    const visible = await this.access.visibleClassIds(user);
    if (visible && !visible.length) return [];

    const qb = this.students
      .createQueryBuilder('s')
      .innerJoin('s.class', 'c')
      .addSelect(['c.id', 'c.name', 'c.academicYear'])
      .leftJoinAndSelect('s.parentLinks', 'l')
      .leftJoin('l.parent', 'p')
      .addSelect(['p.id', 'p.fullName', 'p.phone', 'p.email', 'p.status'])
      .orderBy('s.fullName', 'ASC');
    if (schoolId) qb.andWhere('c.schoolId = :schoolId', { schoolId });
    if (visible) qb.andWhere(visible.length ? 'c.id IN (:...visible)' : '1=0', { visible });
    if (q.classId) qb.andWhere('s.classId = :classId', { classId: q.classId });
    if (q.status) qb.andWhere('s.status = :status', { status: q.status });
    if (q.search) qb.andWhere(likeFolded('s.fullName', 'q'), { q: foldSearch(q.search) });
    if (user.role === UserRole.PARENT) {
      qb.andWhere('l.parentId = :pid AND l.status = :linkActive', {
        pid: user.id,
        linkActive: RecordStatus.ACTIVE,
      });
    }
    return qb.getMany();
  }

  async findOne(user: AuthUser, id: string) {
    await this.access.assertStudent(user, id);
    return this.students.findOneOrFail({
      where: { id },
      relations: { class: { homeroomTeacher: true }, parentLinks: { parent: true } },
    });
  }

  async create(user: AuthUser, dto: CreateStudentDto) {
    await this.access.assertClass(user, dto.classId);
    const saved = await this.students.save(this.students.create(dto));
    return this.findOne(user, saved.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentDto) {
    await this.access.assertStudent(user, id);
    if (dto.classId) await this.access.assertClass(user, dto.classId); // transfer within the same school only
    const changes = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    if (Object.keys(changes).length) await this.students.update(id, changes);
    return this.findOne(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.access.assertStudent(user, id);
    // The child's notes in class journals do not cascade (SQL Server allows one cascade path per table).
    await this.students.manager.transaction(async (tx) => {
      await tx.delete(ClassJournalNote, { studentId: id });
      await tx.delete(Student, id);
    });
    return { success: true };
  }

  // ---- parent_student_map ----

  async linkParent(user: AuthUser, studentId: string, dto: LinkParentDto) {
    const student = await this.access.assertStudent(user, studentId);
    const parent = await this.users.findOne({ where: { id: dto.parentId } });
    if (!parent || parent.role !== UserRole.PARENT) throw new NotFoundException('Parent account not found');
    if (parent.schoolId !== student.class.schoolId)
      throw new BadRequestException('Parent belongs to another school');

    if (dto.isPrimary) await this.links.update({ studentId }, { isPrimary: false });
    await this.links.upsert(
      {
        parentId: dto.parentId,
        studentId,
        relationship: dto.relationship,
        isPrimary: dto.isPrimary ?? false,
        // omitted: a new link is ACTIVE (column default), an existing one keeps its status
        ...(dto.status && { status: dto.status }),
      },
      ['parentId', 'studentId'],
    );
    return this.findOne(user, studentId);
  }

  /** Stores the uploaded photo as the child's avatar and removes the previous uploaded file. */
  async setAvatar(user: AuthUser, studentId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Attach an image in the "avatar" field');
    // Checked first: nothing is stored for a request that is refused.
    const student = await this.access.assertStudent(user, studentId);
    const url = await this.media.save(file, 'photos');
    const previous = student.avatarUrl;
    await this.students.update(studentId, { avatarUrl: url });
    if (previous !== url) await this.media.remove('photos', previous);
    return this.findOne(user, studentId);
  }

  async unlinkParent(user: AuthUser, studentId: string, parentId: string) {
    await this.access.assertStudent(user, studentId);
    const res = await this.links.delete({ studentId, parentId });
    if (!res.affected) throw new NotFoundException('This parent is not linked to the student');
    return this.findOne(user, studentId);
  }
}
