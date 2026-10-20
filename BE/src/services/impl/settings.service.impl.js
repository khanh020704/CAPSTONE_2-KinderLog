import { UnitOfWork } from '../../db/unit-of-work.js'
import { toPublicSettingsResponse, toSettingsResponse } from '../../dtos/settings.dto.js'
import { recordAudit } from '../../utils/audit.js'
import SettingsService from '../settings.service.js'

class SettingsServiceImpl extends SettingsService {
  async get() {
    return toSettingsResponse(await UnitOfWork.read().settings.all())
  }

  async getPublic() {
    return toPublicSettingsResponse(await this.get())
  }

  // Every setting of the form is saved in one unit of work.
  async update(user, dto) {
    await UnitOfWork.run(async (uow) => {
      for (const [key, value] of Object.entries(dto)) await uow.settings.set(key, value)
    })
    await recordAudit({ userId: user.id, action: 'Update', module: 'System Settings', description: 'Global settings updated' })
    return this.get()
  }
}

export default new SettingsServiceImpl()
