import { createHash, randomBytes } from 'node:crypto'

// Opaque tokens (refresh, password reset): the client keeps the token, the database keeps its hash.
export const randomToken = () => randomBytes(48).toString('hex')
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')
