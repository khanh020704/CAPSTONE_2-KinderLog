import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ClassesService } from './classes.service';
import { CreateClassDto, ListClassesQueryDto, UpdateClassDto } from './dto/class.dto';
import { ParseGuidPipe } from '../../common/validators/guid';

@ApiTags('Classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  /** Scoped by role: principal → school, teacher → homeroom classes, parent → children's classes. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListClassesQueryDto) {
    return this.classes.list(user, q);
  }

  /** Class detail with its student roster. */
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL, UserRole.TEACHER)
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.classes.findOne(user, id);
  }

  @Roles(UserRole.PRINCIPAL)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClassDto) {
    return this.classes.create(user, dto);
  }

  @Roles(UserRole.PRINCIPAL)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string, @Body() dto: UpdateClassDto) {
    return this.classes.update(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.classes.remove(user, id);
  }
}
