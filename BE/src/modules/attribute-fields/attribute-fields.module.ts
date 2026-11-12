import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, PartialType } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ParseGuidPipe } from '../../common/validators/guid';
import {
  AttributeField,
  AttributeFieldStatus,
  AttributeFieldType,
  AttributeTarget,
} from './attribute-field.entity';

class CreateAttributeFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsEnum(AttributeFieldType)
  type: AttributeFieldType;

  @IsEnum(AttributeTarget)
  target: AttributeTarget;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

class UpdateAttributeFieldDto extends PartialType(CreateAttributeFieldDto) {}

class AttributeFieldStatusDto {
  @IsEnum(AttributeFieldStatus)
  status: AttributeFieldStatus;
}

/** System Admin: the platform's attribute fields. Names are unique per target record (case-insensitive). */
@Injectable()
class AttributeFieldsService {
  constructor(@InjectRepository(AttributeField) private readonly fields: Repository<AttributeField>) {}

  list() {
    return this.fields.find({ order: { target: 'ASC', name: 'ASC' } });
  }

  async create(dto: CreateAttributeFieldDto) {
    const name = dto.name.trim();
    await this.assertNameFree(dto.target, name);
    return this.fields.save(this.fields.create({ ...dto, name, required: dto.required ?? false }));
  }

  async update(id: string, dto: UpdateAttributeFieldDto) {
    const field = await this.find(id);
    const next = { ...field, ...dto, name: (dto.name ?? field.name).trim() };
    if (next.name !== field.name || next.target !== field.target)
      await this.assertNameFree(next.target, next.name, id);
    await this.fields.update(id, {
      name: next.name,
      type: next.type,
      target: next.target,
      required: next.required,
      description: next.description ?? null,
    });
    return this.find(id);
  }

  async setStatus(id: string, status: AttributeFieldStatus) {
    await this.find(id);
    await this.fields.update(id, { status });
    return this.find(id);
  }

  private async find(id: string) {
    const field = await this.fields.findOne({ where: { id } });
    if (!field) throw new NotFoundException('Attribute field not found');
    return field;
  }

  private async assertNameFree(target: AttributeTarget, name: string, exceptId?: string) {
    const same = await this.fields
      .createQueryBuilder('f')
      .where('f.target = :target AND LOWER(f.name) = LOWER(:name)', { target, name })
      .andWhere(exceptId ? 'f.id <> :exceptId' : '1=1', { exceptId })
      .getExists();
    if (same)
      throw new ConflictException(
        `An attribute field named "${name}" already exists for ${target.toLowerCase()}s`,
      );
  }
}

@ApiTags('Attribute Fields')
@ApiBearerAuth()
@Roles(UserRole.SYSTEM_ADMIN)
@Controller('attribute-fields')
class AttributeFieldsController {
  constructor(private readonly fields: AttributeFieldsService) {}

  @Get()
  list() {
    return this.fields.list();
  }

  @Post()
  create(@Body() dto: CreateAttributeFieldDto) {
    return this.fields.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseGuidPipe) id: string, @Body() dto: UpdateAttributeFieldDto) {
    return this.fields.update(id, dto);
  }

  /** LOCKED hides the field from new entries; ACTIVE shows it again. */
  @Patch(':id/status')
  setStatus(@Param('id', ParseGuidPipe) id: string, @Body() dto: AttributeFieldStatusDto) {
    return this.fields.setStatus(id, dto.status);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AttributeField])],
  controllers: [AttributeFieldsController],
  providers: [AttributeFieldsService],
})
export class AttributeFieldsModule {}
