import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus, UserRole } from '../../common/enums';
import { AccessService } from '../access/access.service';
import { ClassJournal } from '../daily-journals/entities/class-journal.entity';
import { DailyJournal } from '../daily-journals/entities/daily-journal.entity';
import { Student } from '../students/entities/student.entity';
import { User } from '../users/entities/user.entity';
import { CreateClassDto, ListClassesQueryDto, UpdateClassDto } from './dto/class.dto';
import { ClassEntity } from './entities/class.entity';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessService,
  ) {}

  /** Principal: all classes of the school. Teacher: own homeroom classes. Parent: classes of their children. */
  async list(user: AuthUser, q: ListClassesQueryDto) {
    const schoolId = this.access.schoolOf(user, q.schoolId);
    const visible = await this.access.visibleClassIds(user);
    if (visible && !visible.length) return [];

    const qb = this.classes
      .createQueryBuilder('c')
      .leftJoin('c.homeroomTeacher', 't')
      .addSelect(['t.id', 't.fullName', 't.phone', 't.email'])
      .loadRelationCountAndMap('c.studentCount', 'c.students', 's', (sq) =>
        sq.where('s.status = :st', { st: RecordStatus.ACTIVE }),
      )
      .orderBy('c.academicYear', 'DESC')
      .addOrderBy('c.name', 'ASC');
    if (schoolId) qb.andWhere('c.schoolId = :schoolId', { schoolId });
    if (visible) qb.andWhere(visible.length ? 'c.id IN (:...visible)' : '1=0', { visible });
    if (q.academicYear) qb.andWhere('c.academicYear = :y', { y: q.academicYear });
    return qb.getMany();
  }

  async findOne(user: AuthUser, id: string) {
    await this.access.assertClass(user, id);
    return this.classes.findOneOrFail({
      where: { id },
      relations: { homeroomTeacher: true, students: true },
      order: { students: { fullName: 'ASC' } },
    });
  }

  async create(user: AuthUser, dto: CreateClassDto) {
    const schoolId = this.access.requireSchool(user);
    if (dto.homeroomTeacherId) {
      await this.assertTeacher(schoolId, dto.homeroomTeacherId);
      await this.assertTeacherFree(dto.homeroomTeacherId, dto.academicYear);
    }
    await this.assertNameFree(schoolId, dto.academicYear, dto.name);
    const saved = await this.classes.save(this.classes.create({ ...dto, schoolId }));
    return this.findOne(user, saved.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateClassDto) {
    const cls = await this.access.assertClass(user, id);
    const teacherId = dto.homeroomTeacherId === undefined ? cls.homeroomTeacherId : dto.homeroomTeacherId;
    if (dto.homeroomTeacherId) await this.assertTeacher(cls.schoolId, dto.homeroomTeacherId);
    if (teacherId) await this.assertTeacherFree(teacherId, dto.academicYear ?? cls.academicYear, id);
    if (dto.name || dto.academicYear) {
      await this.assertNameFree(cls.schoolId, dto.academicYear ?? cls.academicYear, dto.name ?? cls.name, id);
    }
    await this.classes.update(id, dto);
    return this.findOne(user, id);
  }

  /**
   * Only a class with no students and no journal history can be deleted (its cameras go with it). Otherwise the
   * principal gets the reason instead of a bare foreign-key error, and can deactivate the class to keep its records.
   */
  async remove(user: AuthUser, id: string) {
    await this.access.assertClass(user, id);
    const [students, entries, classJournals] = await Promise.all([
      this.classes.manager.count(Student, { where: { classId: id } }),
      this.classes.manager.count(DailyJournal, { where: { classId: id } }),
      this.classes.manager.count(ClassJournal, { where: { classId: id } }),
    ]);
    if (students) {
      throw new ConflictException(
        `This class still has ${students} student(s). Move them to another class first.`,
      );
    }
    const journals = entries + classJournals;
    if (journals) {
      throw new ConflictException(
        `This class has ${journals} journal entries in its history. Deactivate it instead of deleting it.`,
      );
    }
    await this.classes.delete(id);
    return { success: true };
  }

  private async assertNameFree(schoolId: string, academicYear: string, name: string, exceptId?: string) {
    const taken = await this.classes.exist({
      where: { schoolId, academicYear, name: name.trim(), ...(exceptId && { id: Not(exceptId) }) },
    });
    if (taken) throw new ConflictException(`A class named ${name.trim()} already exists in ${academicYear}`);
  }

  private async assertTeacher(schoolId: string, teacherId: string) {
    const ok = await this.users.exist({
      where: { id: teacherId, schoolId, role: In([UserRole.TEACHER]), status: RecordStatus.ACTIVE },
    });
    if (!ok) throw new BadRequestException('homeroomTeacherId must be an active teacher of this school');
  }

  /** A teacher is the head teacher of at most one class per academic year (User Story 2.7). */
  private async assertTeacherFree(teacherId: string, academicYear: string, exceptId?: string) {
    const other = await this.classes.findOne({
      where: { homeroomTeacherId: teacherId, academicYear, ...(exceptId && { id: Not(exceptId) }) },
      relations: { homeroomTeacher: true },
    });
    if (other) {
      throw new ConflictException(
        `${other.homeroomTeacher?.fullName ?? 'This teacher'} is already the head teacher of ${other.name} in ${academicYear}. Assign another teacher to ${other.name} first.`,
      );
    }
  }
}
