import { AuditLog } from '../models/index.js'

// Audit entries must never break the action they describe, so failures are only logged.
export async function recordAudit({ userId, action, module, description, status = 'Success' }) {
  try {
    await AuditLog.create({ userId, action, entityName: module, description, status })
  } catch (err) {
    console.error(`Could not write audit log: ${err.message}`)
  }
}
