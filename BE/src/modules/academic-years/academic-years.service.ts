import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { AcademicYearStatus } from '../../common/enums';
import { AccessService } from '../access/access.service';
import { ClassEntity } from '../classes/entities/class.entity';
import {
  CreateAcademicYearDto,
  ListAcademicYearsQueryDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto';
import { AcademicYear } from './entities/academic-year.entity';

@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear) private readonly years: Repository<AcademicYear>,
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    private readonly access: AccessService,
  ) {}

  /** Every role sees the years of its own school; the admin sees all (or one school). Newest first. */
  list(user: AuthUser, q: ListAcademicYearsQueryDto) {
    const schoolId = this.access.schoolOf(user, q.schoolId);
    return this.years.find({
      where: { ...(schoolId && { schoolId }), ...(q.status && { status: q.status }) },
      order: { startDate: 'DESC' },
    });
  }

  /** The ACTIVE year of the school, or null. */
  current(user: AuthUser, schoolId?: string) {
    const id = this.access.requireSchool(user, schoolId);
    return this.years.findOne({ where: { schoolId: id, status: AcademicYearStatus.ACTIVE } });
  }

  async findOne(user: AuthUser, id: string) {
    const year = await this.years.findOne({ where: { id } });
    const schoolId = year && this.access.schoolOf(user);
    if (!year || (schoolId && year.schoolId !== schoolId))
      throw new NotFoundException('Academic year not found');
    return year;
  }

  async create(user: AuthUser, dto: CreateAcademicYearDto) {
    const schoolId = this.access.requireSchool(user, dto.schoolId);
    this.assertDates(dto.name, dto.startDate, dto.endDate);
    await this.assertNameFree(schoolId, dto.name);
    return this.years.manager.transaction(async (tx) => {
      if (dto.status === AcademicYearStatus.ACTIVE) await this.deactivateOthers(tx, schoolId);
      return tx.save(
        tx.create(AcademicYear, {
          schoolId,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status: dto.status ?? AcademicYearStatus.INACTIVE,
        }),
      );
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateAcademicYearDto) {
    const year = await this.findOne(user, id);
    const next = { ...year, ...dto };
    this.assertDates(next.name, next.startDate, next.endDate);
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
