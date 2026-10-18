import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { foldSearch, likeFolded } from '../../common/utils/sql.util';
import { AccessService } from '../access/access.service';
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
    if (visible) qb.andWhere('c.id IN (:...visible)', { visible });
    if (q.classId) qb.andWhere('s.classId = :classId', { classId: q.classId });
    if (q.status) qb.andWhere('s.status = :status', { status: q.status });
    if (q.search) qb.andWhere(likeFolded('s.fullName', 'q'), { q: foldSearch(q.search) });
    if (user.role === UserRole.PARENT) qb.andWhere('l.parentId = :pid', { pid: user.id });
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
    await this.students.delete(id);
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
      },
      ['parentId', 'studentId'],
    );
    return this.findOne(user, studentId);
  }

  async unlinkParent(user: AuthUser, studentId: string, parentId: string) {
    await this.access.assertStudent(user, studentId);
    const res = await this.links.delete({ studentId, parentId });
    if (!res.affected) throw new NotFoundException('This parent is not linked to the student');
    return this.findOne(user, studentId);
  }
}
