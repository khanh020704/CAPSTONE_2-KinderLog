import { auditLogService } from '../services/index.js'
import { toCreateAuditLogDto, toUpdateAuditLogDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(auditLogService, { toCreateDto: toCreateAuditLogDto, toUpdateDto: toUpdateAuditLogDto })
