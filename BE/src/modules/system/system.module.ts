import { Body, Controller, Get, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { SettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';
import { SystemSetting } from './system-setting.entity';
import { SystemService } from './system.service';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system')
class SystemController {
  constructor(
    private readonly system: SystemService,
    private readonly settings: SettingsService,
  ) {}

  /** CPU, memory, disk, upload folder and database size, measured now. */
  @Roles(UserRole.SYSTEM_ADMIN)
  @Get('metrics')
  metrics() {
    return this.system.metrics();
  }

  /** Every signed-in user: the platform settings the screens apply (password length, photos per journal…). */
  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Roles(UserRole.SYSTEM_ADMIN)
  @Put('settings')
  updateSettings(@Body() dto: SettingsDto) {
    return this.settings.update(dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting])],
  controllers: [SystemController],
  providers: [SystemService, SettingsService],
  exports: [SettingsService],
})
export class SystemModule {}
