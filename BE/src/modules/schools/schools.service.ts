import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';
import { School } from './entities/school.entity';

@Injectable()
export class SchoolsService {
  constructor(@InjectRepository(School) private readonly schools: Repository<School>) {}

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
      .loadRelationCountAndMap('s.parentCount', 's.users', 'pa', (qb) =>
        qb.where('pa.role = :r', { r: UserRole.PARENT }),
      )
      .orderBy('s.createdAt', 'ASC')
      .getMany();
    return rows.map(({ users, ...s }) => ({ ...s, principals: users ?? [] }));
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
    return this.schools.save(this.schools.create(dto));
  }

  async update(id: string, dto: UpdateSchoolDto) {
    await this.findOne(id);
    await this.schools.update(id, dto);
    return this.findOne(id);
  }

  /** Hard delete is blocked by FK RESTRICT while the school still has users or classes. */
  async remove(id: string) {
    await this.findOne(id);
    await this.schools.delete(id);
    return { success: true };
  }
}
