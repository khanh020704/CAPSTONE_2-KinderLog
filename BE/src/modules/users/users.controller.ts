import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateProfileDto,
  UpdateStatusDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Any signed-in user: edit own name / email / address. */
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user, dto);
  }

  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListUsersQueryDto) {
    return this.users.list(user, q);
  }

  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(user, id);
  }

  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }

  /** Activate / Deactivate / Lock */
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.users.setStatus(user, id, dto);
  }

  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Post(':id/reset-password')
  resetPassword(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.resetPassword(user, id);
  }

  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.remove(user, id);
  }
}
