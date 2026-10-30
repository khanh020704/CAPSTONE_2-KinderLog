import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { SystemService } from './system.service';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system')
class SystemController {
  constructor(private readonly system: SystemService) {}

  /** CPU, memory, disk, upload folder and database size, measured now. */
  @Roles(UserRole.SYSTEM_ADMIN)
  @Get('metrics')
  metrics() {
    return this.system.metrics();
  }
}

@Module({ controllers: [SystemController], providers: [SystemService] })
export class SystemModule {}
