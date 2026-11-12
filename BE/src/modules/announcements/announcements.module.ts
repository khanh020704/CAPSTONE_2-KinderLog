import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQueryDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { SchoolAnnouncement } from './entities/school-announcement.entity';
import { ParseGuidPipe } from '../../common/validators/guid';

@ApiTags('School Announcements')
@ApiBearerAuth()
@Controller('announcements')
class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  /** Paginated; teachers and parents only get published notices meant for them. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListAnnouncementsQueryDto) {
    return this.announcements.list(user, q);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.announcements.findOne(user, id);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(user, dto);
  }

  /** status: PUBLISHED publishes it (the audience is notified the first time). */
  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseGuidPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcements.update(user, id, dto);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.announcements.remove(user, id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SchoolAnnouncement, User]), NotificationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
