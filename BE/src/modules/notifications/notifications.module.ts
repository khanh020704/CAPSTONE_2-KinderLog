import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { ListNotificationsQueryDto, SendNotificationDto } from './dto/notification.dto';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
/** The notification inbox is for teachers and parents; the principal and the admin only send (POST). */
@Roles(UserRole.TEACHER, UserRole.PARENT)
@Controller('notifications')
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** The signed-in user's notifications, newest first (?unread=true, ?type=, ?page=, ?limit=). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListNotificationsQueryDto) {
    return this.notifications.list(user, q);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Roles(UserRole.PRINCIPAL, UserRole.SYSTEM_ADMIN)
  @Post()
  send(@CurrentUser() user: AuthUser, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user, dto);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.remove(user, id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
