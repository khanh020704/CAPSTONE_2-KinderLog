import { Notification } from '../../models/index.js'
import { toInboxItem } from '../../dtos/inbox.dto.js'
import InboxService from '../inbox.service.js'

const MAX_ITEMS = 200

// Every query is limited to the signed-in user's own notifications.
class InboxServiceImpl extends InboxService {
  async list(user, { unreadOnly }) {
    const filter = { userId: user.id, ...(unreadOnly && { isRead: false }) }
    const notifications = await Notification.find(filter).sort({ sentAt: -1 }).limit(MAX_ITEMS)
    return { items: notifications.map(toInboxItem) }
  }

  async unreadCount(user) {
    return { count: await Notification.countDocuments({ userId: user.id, isRead: false }) }
  }

  async markRead(user, { ids, all }) {
    const filter = { userId: user.id, isRead: false, ...(!all && { _id: { $in: ids } }) }
    await Notification.updateMany(filter, { isRead: true, readAt: new Date() })
  }
}

export default new InboxServiceImpl()
