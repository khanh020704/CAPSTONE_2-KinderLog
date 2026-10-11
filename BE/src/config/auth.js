export const JWT_EXPIRES_SECONDS = Number(process.env.JWT_EXPIRES_SECONDS) || 3600

// Read when a token is signed or verified, so the server can refuse to start without it.
export function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set. Add it to BE/.env.')
  return secret
}
