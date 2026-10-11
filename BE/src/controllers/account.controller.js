import { accountService } from '../services/index.js'
import { toChangePasswordDto, toUpdateProfileDto } from '../dtos/account.dto.js'

export async function getProfile(req, res) {
  res.json(await accountService.getProfile(req.user))
}

export async function updateProfile(req, res) {
  res.json(await accountService.updateProfile(req.user, toUpdateProfileDto(req.body)))
}

export async function changePassword(req, res) {
  await accountService.changePassword(req.user, toChangePasswordDto(req.body))
  res.status(204).end()
}
