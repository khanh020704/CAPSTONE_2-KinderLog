import { UnitOfWork } from '../db/unit-of-work.js'

// Audit entries must never break the action they describe, so each is written in a unit of work of its own
// and failures are only logged.
export async function recordAudit({ userId, action, module, description, status = 'Success' }) {
  try {
    await UnitOfWork.run((uow) => uow.auditLogs.insert({ userId, action, entityName: module, description, status }))
  } catch (err) {
    console.error(`Could not write audit log: ${err.message}`)
  }
}
