import { authService } from '../services/index.js'
import { ForbiddenError, UnauthenticatedError } from '../utils/errors.js'

// Requires "Authorization: Bearer <token>" and puts the signed-in user on req.user.
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ')
  if (scheme !== 'Bearer' || !token) throw new UnauthenticatedError()
  req.user = await authService.authenticate(token)
  next()
}

// Use after authenticate: authorize('ADMIN', 'TEACHER')
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) throw new ForbiddenError()
  next()
}
