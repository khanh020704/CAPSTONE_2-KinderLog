import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { EditMessageDto, SendMessageDto, ThreadQueryDto } from './dto/message.dto';
import { Message } from './entities/message.entity';
import { MessagesService } from './messages.service';
import { ParseGuidPipe } from '../../common/validators/guid';

/** Teachers and parents only (no messaging for the principal or the system admin); who may write to whom is decided
 * by MessagesService. */
@ApiTags('Messages')
@ApiBearerAuth()
@Roles(UserRole.TEACHER, UserRole.PARENT)
@Controller('messages')
class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** Conversation list: allowed contacts with last message and unread count, most recent first. */
  @Get('contacts')
  contacts(@CurrentUser() user: AuthUser) {
    return this.messages.contacts(user);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.messages.unreadCount(user);
  }

  /** Messages with one person, newest first (?page, ?limit, ?before). */
  @Get('thread/:userId')
  thread(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseGuidPipe) userId: string,
    @Query() q: ThreadQueryDto,
  ) {
    return this.messages.thread(user, userId, q);
  }

  @Patch('thread/:userId/read')
  markThreadRead(@CurrentUser() user: AuthUser, @Param('userId', ParseGuidPipe) userId: string) {
    return this.messages.markThreadRead(user, userId);
  }

  @Post()
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.messages.send(user, dto);
  }

  @Patch(':id')
  edit(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string, @Body() dto: EditMessageDto) {
    return this.messages.edit(user, id, dto.content);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseGuidPipe) id: string) {
    return this.messages.remove(user, id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Message, User]), NotificationsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
