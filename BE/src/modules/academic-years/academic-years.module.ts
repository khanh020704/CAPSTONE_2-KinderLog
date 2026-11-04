import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ClassEntity } from '../classes/entities/class.entity';
import { AcademicYearsService } from './academic-years.service';
import {
  CreateAcademicYearDto,
  CreateSemesterDto,
  ListAcademicYearsQueryDto,
  UpdateAcademicYearDto,
  UpdateSemesterDto,
} from './dto/academic-year.dto';
import { AcademicYear } from './entities/academic-year.entity';
import { Semester } from './entities/semester.entity';
import { ParseGuidPipe } from '../../common/validators/guid';

@ApiTags('Academic Years')
@ApiBearerAuth()
@Controller('academic-years')
class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  /** All roles: the years of their school (admin: all, or ?schoolId=). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListAcademicYearsQueryDto) {
    return this.years.list(user, q);
  }

  /** The ACTIVE year of the school, or null. */
  @Get('current')
  current(@CurrentUser() user: AuthUser, @Query() q: ListAcademicYearsQueryDto) {
    return this.years.current(user, q.schoolId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.years.findOne(user, id);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAcademicYearDto) {
    return this.years.create(user, dto);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.years.update(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.years.remove(user, id);
  }

  /** Semester routes answer the whole academic year, with its semesters. */
  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Post(':id/semesters')
  createSemester(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @Body() dto: CreateSemesterDto,
  ) {
    return this.years.createSemester(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Patch('semesters/:semesterId')
  updateSemester(
    @CurrentUser() user: AuthUser,
    @Param('semesterId', ParseGuidPipe) id: string,
    @Body() dto: UpdateSemesterDto,
  ) {
    return this.years.updateSemester(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Delete('semesters/:semesterId')
  removeSemester(@CurrentUser() user: AuthUser, @Param('semesterId', ParseGuidPipe) id: string) {
    return this.years.removeSemester(user, id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AcademicYear, Semester, ClassEntity])],
  controllers: [AcademicYearsController],
  providers: [AcademicYearsService],
})
export class AcademicYearsModule {}
