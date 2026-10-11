import { isDatabaseConnected } from '../config/database.js'

export function getHealth(req, res) {
  if (isDatabaseConnected()) return res.json({ status: 'ok', database: 'ok' })
  res.status(503).json({ status: 'error', database: 'unreachable' })
}
