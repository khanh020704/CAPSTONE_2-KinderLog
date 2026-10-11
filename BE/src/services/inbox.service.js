const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the signed-in user's notification inbox. */
export default class InboxService {
  /**
   * @returns {Promise<{ items: object[] }>} newest first
   */
  async list(user, query) {
    throw notImplemented('list')
  }

  /**
   * @returns {Promise<{ count: number }>}
   */
  async unreadCount(user) {
    throw notImplemented('unreadCount')
  }

  /**
   * @returns {Promise<void>}
   */
  async markRead(user, dto) {
    throw notImplemented('markRead')
  }
}
