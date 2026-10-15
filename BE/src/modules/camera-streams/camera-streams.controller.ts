import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { CameraStreamsService } from './camera-streams.service';
import {
  CreateCameraStreamDto,
  ListCameraStreamsQueryDto,
  UpdateCameraStreamDto,
  WatchQueryDto,
} from './dto/camera-stream.dto';

@ApiTags('Camera Streams')
@ApiBearerAuth()
@Controller('camera-streams')
export class CameraStreamsController {
  constructor(private readonly cameras: CameraStreamsService) {}

  /** Parent (by studentId) or staff (by classId): cameras of the class, URL only inside the viewing window. */
  @Get('watch')
  watch(@CurrentUser() user: AuthUser, @Query() q: WatchQueryDto) {
    return this.cameras.watch(user, q);
  }

  @Get(':id/watch')
  watchOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cameras.watchOne(user, id);
  }

  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL, UserRole.TEACHER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListCameraStreamsQueryDto) {
    return this.cameras.list(user, q);
  }

  @Roles(UserRole.PRINCIPAL)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCameraStreamDto) {
    return this.cameras.create(user, dto);
  }

  @Roles(UserRole.PRINCIPAL)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCameraStreamDto,
  ) {
    return this.cameras.update(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cameras.remove(user, id);
  }
}
