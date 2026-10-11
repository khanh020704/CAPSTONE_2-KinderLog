import { AuditLog } from '../../models/index.js'
import { toAuditLogResponse } from '../../dtos/audit-log.dto.js'
import AuditLogService from '../audit-log.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class AuditLogServiceImpl extends crudServiceImpl(AuditLogService) {
  constructor() {
    super(AuditLog, toAuditLogResponse)
  }
}

export default new AuditLogServiceImpl()
