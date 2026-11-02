import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { CreateStudentDto, LinkParentDto, ListStudentsQueryDto, UpdateStudentDto } from './dto/student.dto';
import { photoUpload } from '../daily-journals/upload.config';
import { StudentsService } from './students.service';
import { ParseGuidPipe } from '../../common/validators/guid';

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
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
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
    @Param('id', ParseGuidPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    if (user.role === UserRole.TEACHER) {
      const { allergies, medicalNote } = dto;
      return this.students.update(user, id, { allergies, medicalNote });
    }
    return this.students.update(user, id, dto);
  }

  /** The child's profile photo (multipart, one image in the "avatar" field); replaces the previous one. */
  @Roles(UserRole.PRINCIPAL)
  @Post(':id/avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar', photoUpload()))
  setAvatar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.students.setAvatar(user, id, file);
  }

  @Roles(UserRole.PRINCIPAL)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.students.remove(user, id);
  }

  @Roles(UserRole.PRINCIPAL)
  @Post(':id/parents')
  linkParent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @Body() dto: LinkParentDto,
  ) {
    return this.students.linkParent(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL)
  @Delete(':id/parents/:parentId')
  unlinkParent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @Param('parentId', ParseGuidPipe) parentId: string,
  ) {
    return this.students.unlinkParent(user, id, parentId);
  }
}
