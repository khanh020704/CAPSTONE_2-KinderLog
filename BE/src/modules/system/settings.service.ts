import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_SETTINGS, SettingsDto } from './dto/settings.dto';
import { SystemSetting } from './system-setting.entity';

const KEY = 'global';

/**
 * The platform-wide parameters, stored in the database so every browser and the server use the same values.
 * Changes take effect at once (no restart) and are audited by the interceptor (module "System Settings").
 */
@Injectable()
export class SettingsService {
  constructor(@InjectRepository(SystemSetting) private readonly settings: Repository<SystemSetting>) {}

  async get(): Promise<SettingsDto> {
    const row = await this.settings.findOne({ where: { key: KEY } });
    return { ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.value) as Partial<SettingsDto>) : {}) };
  }

  async update(dto: SettingsDto) {
    await this.settings.save({ key: KEY, value: JSON.stringify(dto) });
    return this.get();
  }
}
