import { Controller, Delete, Get, Module, Query } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogsService } from './audit-logs.service';
import { ListAuditLogsQueryDto, PurgeAuditLogsQueryDto } from './dto/audit-log.dto';
import { AuditLog } from './entities/audit-log.entity';

/** Read-only for users: entries are written by AuditInterceptor and can only be purged by age. */
@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
class AuditLogsController {
  constructor(private readonly audit: AuditLogsService) {}

  /** Newest first; filters: from, to, userId, role, action, module, status, search; page, limit. */
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.PRINCIPAL)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListAuditLogsQueryDto) {
    return this.audit.list(user, q);
  }

  /** Retention: delete entries older than ?before=YYYY-MM-DD. */
  @Roles(UserRole.SYSTEM_ADMIN)
  @Delete()
  purge(@Query() q: PurgeAuditLogsQueryDto) {
    return this.audit.purge(q.before);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogsController],
  providers: [AuditLogsService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AuditLogsModule {}
