import { SystemSetting } from '../../models/index.js'
import { toPublicSettingsResponse, toSettingsResponse } from '../../dtos/settings.dto.js'
import { recordAudit } from '../../utils/audit.js'
import SettingsService from '../settings.service.js'

class SettingsServiceImpl extends SettingsService {
  async get() {
    const rows = await SystemSetting.find()
    return toSettingsResponse(Object.fromEntries(rows.map((row) => [row.key, row.value])))
  }

  async getPublic() {
    return toPublicSettingsResponse(await this.get())
  }

  async update(user, dto) {
    await SystemSetting.bulkWrite(
      Object.entries(dto).map(([key, value]) => ({ updateOne: { filter: { key }, update: { $set: { value } }, upsert: true } })),
    )
    await recordAudit({ userId: user.id, action: 'Update', module: 'System Settings', description: 'Global settings updated' })
    return this.get()
  }
}

export default new SettingsServiceImpl()
