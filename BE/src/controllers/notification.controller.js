import { notificationService } from '../services/index.js'
import { toCreateNotificationDto, toUpdateNotificationDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(notificationService, { toCreateDto: toCreateNotificationDto, toUpdateDto: toUpdateNotificationDto })
