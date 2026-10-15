import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { RecordStatus, UserRole } from '../../common/enums';
import { AccessService } from '../access/access.service';
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
    if (visible) qb.andWhere('c.id IN (:...visible)', { visible });
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
    if (dto.homeroomTeacherId) await this.assertTeacher(schoolId, dto.homeroomTeacherId);
    const saved = await this.classes.save(this.classes.create({ ...dto, schoolId }));
    return this.findOne(user, saved.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateClassDto) {
    const cls = await this.access.assertClass(user, id);
    if (dto.homeroomTeacherId) await this.assertTeacher(cls.schoolId, dto.homeroomTeacherId);
    await this.classes.update(id, dto);
    return this.findOne(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.access.assertClass(user, id);
    await this.classes.delete(id); // RESTRICT while students remain
    return { success: true };
  }

  private async assertTeacher(schoolId: string, teacherId: string) {
    const ok = await this.users.exist({
      where: { id: teacherId, schoolId, role: In([UserRole.TEACHER]), status: RecordStatus.ACTIVE },
    });
    if (!ok) throw new BadRequestException('homeroomTeacherId must be an active teacher of this school');
  }
}
