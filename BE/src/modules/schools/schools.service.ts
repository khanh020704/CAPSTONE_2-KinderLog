import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AcademicYearStatus, RecordStatus, UserRole } from '../../common/enums';
import { isoDate } from '../../common/utils/date.util';
import { academicYearOf } from '../academic-years/academic-year.util';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { ClassEntity } from '../classes/entities/class.entity';
import { User } from '../users/entities/user.entity';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';
import { School } from './entities/school.entity';

@Injectable()
export class SchoolsService {
  constructor(
    @InjectRepository(School) private readonly schools: Repository<School>,
    private readonly config: ConfigService,
  ) {}

  /** Schools with their principal and headcounts – the System Admin overview table. */
  async list() {
    const rows = await this.schools
      .createQueryBuilder('s')
      .leftJoin('s.users', 'p', 'p.role = :principal', { principal: UserRole.PRINCIPAL })
      .addSelect(['p.id', 'p.fullName', 'p.phone', 'p.status'])
      .loadRelationCountAndMap('s.classCount', 's.classes')
      .loadRelationCountAndMap('s.teacherCount', 's.users', 't', (qb) =>
        qb.where('t.role = :r', { r: UserRole.TEACHER }),
      )
      .orderBy('s.createdAt', 'ASC')
      .getMany();
    // Students belong to a school through their class, so they are counted with a grouped query.
    const students = await this.schools.manager
      .createQueryBuilder()
      .select('c.school_id', 'schoolId')
      .addSelect('COUNT(*)', 'n')
      .from('students', 'st')
      .innerJoin('classes', 'c', 'c.id = st.class_id')
      .where('st.status = :active', { active: RecordStatus.ACTIVE })
      .groupBy('c.school_id')
      .getRawMany<{ schoolId: string; n: number | string }>();
    const studentCount = new Map(students.map((r) => [r.schoolId, Number(r.n)]));
    return rows.map(({ users, ...s }) => ({
      ...s,
      principals: users ?? [],
      studentCount: studentCount.get(s.id) ?? 0,
    }));
  }

  async findOne(id: string) {
    const school = await this.schools.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async create(dto: CreateSchoolDto) {
    if (await this.schools.exist({ where: { name: dto.name.trim() } })) {
      throw new ConflictException('A school with this name already exists');
    }
    // A new school starts with the current academic year, so classes can be created right away.
    return this.schools.manager.transaction(async (tx) => {
      const school = await tx.save(tx.create(School, dto));
      const year = academicYearOf(isoDate(this.config.get<string>('timezone')!));
      await tx.insert(AcademicYear, { schoolId: school.id, ...year, status: AcademicYearStatus.ACTIVE });
      return school;
    });
  }

  async update(id: string, dto: UpdateSchoolDto) {
    await this.findOne(id);
    if (dto.name && (await this.schools.exist({ where: { name: dto.name.trim(), id: Not(id) } }))) {
      throw new ConflictException('A school with this name already exists');
    }
    await this.schools.update(id, dto);
    return this.findOne(id);
  }

  /**
   * Only an empty school can be deleted (its academic years and announcements go with it). One that still has accounts
   * or classes is refused with what is left, instead of a bare foreign-key error; deactivating / locking it keeps the data.
   */
  async remove(id: string) {
    await this.findOne(id);
    const [accounts, classes] = await Promise.all([
      this.schools.manager.count(User, { where: { schoolId: id } }),
      this.schools.manager.count(ClassEntity, { where: { schoolId: id } }),
    ]);
    if (accounts || classes) {
      throw new ConflictException(
        `This school still has ${accounts} account(s) and ${classes} class(es). Remove them first, or deactivate / lock the school instead.`,
      );
    }
    await this.schools.delete(id);
    return { success: true };
  }
}
