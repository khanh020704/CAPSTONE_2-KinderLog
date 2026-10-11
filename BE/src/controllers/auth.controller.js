import { authService } from '../services/index.js'
import { toForgotPasswordDto, toLoginDto, toLogoutDto, toRefreshDto, toResetPasswordDto } from '../dtos/auth.dto.js'

export async function login(req, res) {
  res.json(await authService.login(toLoginDto(req.body)))
}

export async function refresh(req, res) {
  res.json(await authService.refresh(toRefreshDto(req.body)))
}

export async function logout(req, res) {
  await authService.logout(req.user, toLogoutDto(req.body))
  res.status(204).end()
}

export async function forgotPassword(req, res) {
  res.json(await authService.forgotPassword(toForgotPasswordDto(req.body)))
}

export async function resetPassword(req, res) {
  await authService.resetPassword(toResetPasswordDto(req.body))
  res.status(204).end()
}
