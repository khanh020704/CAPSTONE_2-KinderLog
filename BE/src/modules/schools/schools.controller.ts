import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AccessService } from '../access/access.service';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';
import { SchoolsService } from './schools.service';

@ApiTags('Schools')
@ApiBearerAuth()
@Controller('schools')
export class SchoolsController {
  constructor(
    private readonly schools: SchoolsService,
    private readonly access: AccessService,
  ) {}

  /** Principal / teacher / parent: the school they belong to. */
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.schools.findOne(this.access.requireSchool(user));
  }

  /** Principal edits the profile of their own school (status stays with the System Admin). */
  @Roles(UserRole.PRINCIPAL)
  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateSchoolDto) {
    const { status, ...rest } = dto;
    return this.schools.update(this.access.requireSchool(user), rest);
  }

  @Roles(UserRole.SYSTEM_ADMIN)
  @Get()
  list() {
    return this.schools.list();
  }

  @Roles(UserRole.SYSTEM_ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.schools.findOne(id);
  }

  @Roles(UserRole.SYSTEM_ADMIN)
  @Post()
  create(@Body() dto: CreateSchoolDto) {
    return this.schools.create(dto);
  }

  @Roles(UserRole.SYSTEM_ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolDto) {
    return this.schools.update(id, dto);
  }

  @Roles(UserRole.SYSTEM_ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.schools.remove(id);
  }
}
