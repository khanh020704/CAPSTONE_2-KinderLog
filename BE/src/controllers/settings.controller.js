import { settingsService } from '../services/index.js'
import { toUpdateSettingsDto } from '../dtos/settings.dto.js'

export async function getSettings(req, res) {
  res.json(await settingsService.get())
}

export async function getPublicSettings(req, res) {
  res.json(await settingsService.getPublic())
}

export async function updateSettings(req, res) {
  res.json(await settingsService.update(req.user, toUpdateSettingsDto(req.body)))
}
