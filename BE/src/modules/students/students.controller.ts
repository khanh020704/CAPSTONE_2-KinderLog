import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { CreateStudentDto, LinkParentDto, ListStudentsQueryDto, UpdateStudentDto } from './dto/student.dto';
import { StudentsService } from './students.service';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  /** Scoped by role; a parent only ever sees their own children. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListStudentsQueryDto) {
    return this.students.list(user, q);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.findOne(user, id);
  }

  @Roles(UserRole.PRINCIPAL)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.students.create(user, dto);
  }

  /** Principal edits the profile; the homeroom teacher may update allergies / medical notes too. */
  @Roles(UserRole.PRINCIPAL, UserRole.TEACHER)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    if (user.role === UserRole.TEACHER) {
      const { allergies, medicalNote } = dto;
      return this.students.update(user, id, { allergies, medicalNote });
    }
    return this.students.update(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.remove(user, id);
  }

  @Roles(UserRole.PRINCIPAL)
  @Post(':id/parents')
  linkParent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkParentDto,
  ) {
    return this.students.linkParent(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL)
  @Delete(':id/parents/:parentId')
  unlinkParent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
  ) {
    return this.students.unlinkParent(user, id, parentId);
  }
}
