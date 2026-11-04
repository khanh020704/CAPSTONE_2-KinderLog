import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { AcademicYearStatus } from '../../common/enums';
import { AccessService } from '../access/access.service';
import { ClassEntity } from '../classes/entities/class.entity';
import { defaultSemesters } from './academic-year.util';
import {
  CreateAcademicYearDto,
  CreateSemesterDto,
  ListAcademicYearsQueryDto,
  UpdateAcademicYearDto,
  UpdateSemesterDto,
} from './dto/academic-year.dto';
import { AcademicYear } from './entities/academic-year.entity';
import { Semester } from './entities/semester.entity';

// Every year is returned with its semesters, oldest semester first.
const WITH_SEMESTERS = {
  relations: { semesters: true },
  order: { semesters: { startDate: 'ASC' } },
} as const;

@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear) private readonly years: Repository<AcademicYear>,
    @InjectRepository(Semester) private readonly semesters: Repository<Semester>,
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    private readonly access: AccessService,
  ) {}

  /** Every role sees the years of its own school; the admin sees all (or one school). Newest first. */
  list(user: AuthUser, q: ListAcademicYearsQueryDto) {
    const schoolId = this.access.schoolOf(user, q.schoolId);
    return this.years.find({
      where: { ...(schoolId && { schoolId }), ...(q.status && { status: q.status }) },
      relations: WITH_SEMESTERS.relations,
      order: { startDate: 'DESC', semesters: { startDate: 'ASC' } },
    });
  }

  /** The ACTIVE year of the school, or null. */
  current(user: AuthUser, schoolId?: string) {
    const id = this.access.requireSchool(user, schoolId);
    return this.years.findOne({
      where: { schoolId: id, status: AcademicYearStatus.ACTIVE },
      ...WITH_SEMESTERS,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const year = await this.years.findOne({ where: { id }, ...WITH_SEMESTERS });
    const schoolId = year && this.access.schoolOf(user);
    if (!year || (schoolId && year.schoolId !== schoolId))
      throw new NotFoundException('Academic year not found');
    return year;
  }

  async create(user: AuthUser, dto: CreateAcademicYearDto) {
    const schoolId = this.access.requireSchool(user, dto.schoolId);
    this.assertDates(dto.name, dto.startDate, dto.endDate);
    await this.assertNameFree(schoolId, dto.name);
    const id = await this.years.manager.transaction(async (tx) => {
      if (dto.status === AcademicYearStatus.ACTIVE) await this.deactivateOthers(tx, schoolId);
      const year = await tx.save(
        tx.create(AcademicYear, {
          schoolId,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status: dto.status ?? AcademicYearStatus.INACTIVE,
        }),
      );
      // A new year starts with Học kỳ 1 and Học kỳ 2; the principal can change them afterwards.
      const terms = defaultSemesters(year).map((s) => ({ ...s, academicYearId: year.id }));
      if (terms.length) await tx.insert(Semester, terms);
      return year.id;
    });
    return this.findOne(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateAcademicYearDto) {
    const year = await this.findOne(user, id);
    const next = { ...year, ...dto };
    this.assertDates(next.name, next.startDate, next.endDate);
    const outside = year.semesters.find((s) => s.startDate < next.startDate || s.endDate > next.endDate);
    if (outside) {
      throw new BadRequestException(`${outside.name} falls outside these dates; change or delete it first`);
    }
    if (dto.name && dto.name !== year.name) {
      await this.assertNameFree(year.schoolId, dto.name, id);
      if (await this.classCount(year)) {
        throw new ConflictException('Classes use this academic year, so its name cannot change');
      }
    }
    await this.years.manager.transaction(async (tx) => {
      if (dto.status === AcademicYearStatus.ACTIVE) await this.deactivateOthers(tx, year.schoolId, id);
      await tx.update(AcademicYear, id, {
        name: next.name,
        startDate: next.startDate,
        endDate: next.endDate,
        status: next.status,
      });
    });
    return this.findOne(user, id);
  }

  // ---------- Semesters (học kỳ) ----------

  /** Adds a semester to a year; it must lie inside the year and not overlap its other semesters. */
  async createSemester(user: AuthUser, yearId: string, dto: CreateSemesterDto) {
    const year = await this.findOne(user, yearId);
    const semester = { name: dto.name.trim(), startDate: dto.startDate, endDate: dto.endDate };
    this.assertSemester(year, semester);
    await this.semesters.insert({ ...semester, academicYearId: year.id });
    return this.findOne(user, year.id);
  }

  async updateSemester(user: AuthUser, id: string, dto: UpdateSemesterDto) {
    const { year, semester } = await this.findSemester(user, id);
    const next = {
      name: dto.name?.trim() ?? semester.name,
      startDate: dto.startDate ?? semester.startDate,
      endDate: dto.endDate ?? semester.endDate,
    };
    this.assertSemester(year, next, id);
    await this.semesters.update(id, next);
    return this.findOne(user, year.id);
  }

  async removeSemester(user: AuthUser, id: string) {
    const { year } = await this.findSemester(user, id);
    await this.semesters.delete(id);
    return this.findOne(user, year.id);
  }

  private async findSemester(user: AuthUser, id: string) {
    const semester = await this.semesters.findOne({ where: { id } });
    if (!semester) throw new NotFoundException('Semester not found');
    const year = await this.findOne(user, semester.academicYearId).catch(() => {
      throw new NotFoundException('Semester not found');
    });
    return { year, semester };
  }

  private assertSemester(
    year: AcademicYear,
    s: Pick<Semester, 'name' | 'startDate' | 'endDate'>,
    exceptId?: string,
  ) {
    if (s.endDate <= s.startDate) throw new BadRequestException('endDate must be after startDate');
    if (s.startDate < year.startDate || s.endDate > year.endDate) {
      throw new BadRequestException(
        `The semester must lie inside ${year.name} (${year.startDate} – ${year.endDate})`,
      );
    }
    const others = year.semesters.filter((o) => o.id !== exceptId);
    if (others.some((o) => o.name.toLowerCase() === s.name.toLowerCase())) {
      throw new ConflictException(`${s.name} already exists in ${year.name}`);
    }
    const overlap = others.find((o) => s.startDate <= o.endDate && o.startDate <= s.endDate);
    if (overlap) throw new ConflictException(`The dates overlap ${overlap.name}`);
  }

  async remove(user: AuthUser, id: string) {
    const year = await this.findOne(user, id);
    const n = await this.classCount(year);
    if (n) throw new ConflictException(`${n} class(es) belong to ${year.name}; move or delete them first`);
    await this.years.delete(id);
    return { success: true };
  }

  private classCount(year: AcademicYear) {
    return this.classes.count({ where: { schoolId: year.schoolId, academicYear: year.name } });
  }

  private assertDates(name: string, start: string, end: string) {
    const [a, b] = name.split('-').map(Number);
    if (b !== a + 1) throw new BadRequestException('name must be two consecutive years, e.g. 2026-2027');
    if (end <= start) throw new BadRequestException('endDate must be after startDate');
  }

  private async assertNameFree(schoolId: string, name: string, exceptId?: string) {
    const taken = await this.years.exist({
      where: { schoolId, name, ...(exceptId && { id: Not(exceptId) }) },
    });
    if (taken) throw new ConflictException(`Academic year ${name} already exists`);
  }

  private deactivateOthers(tx: EntityManager, schoolId: string, exceptId?: string) {
    return tx.update(
      AcademicYear,
      { schoolId, status: AcademicYearStatus.ACTIVE, ...(exceptId && { id: Not(exceptId) }) },
      { status: AcademicYearStatus.INACTIVE },
    );
  }
}
