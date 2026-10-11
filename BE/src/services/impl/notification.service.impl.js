import { Notification } from '../../models/index.js'
import { toNotificationResponse } from '../../dtos/notification.dto.js'
import NotificationService from '../notification.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class NotificationServiceImpl extends crudServiceImpl(NotificationService) {
  constructor() {
    super(Notification, toNotificationResponse)
  }
}

export default new NotificationServiceImpl()
