import { UnitOfWork } from '../../db/unit-of-work.js'
import { toInboxItem } from '../../dtos/inbox.dto.js'
import InboxService from '../inbox.service.js'

const MAX_ITEMS = 200

// Every query is limited to the signed-in user's own notifications.
class InboxServiceImpl extends InboxService {
  async list(user, { unreadOnly }) {
    const filter = { userId: user.id, ...(unreadOnly && { isRead: false }) }
    const notifications = await UnitOfWork.read().notifications.find(filter, { orderBy: [['sentAt', 'DESC'], ['id', 'DESC']], limit: MAX_ITEMS })
    return { items: notifications.map(toInboxItem) }
  }

  async unreadCount(user) {
    return { count: await UnitOfWork.read().notifications.count({ userId: user.id, isRead: false }) }
  }

  async markRead(user, { ids, all }) {
    const filter = { userId: user.id, isRead: false, ...(!all && { id: ids }) }
    await UnitOfWork.run((uow) => uow.notifications.update(filter, { isRead: true, readAt: new Date() }))
  }
}

export default new InboxServiceImpl()
