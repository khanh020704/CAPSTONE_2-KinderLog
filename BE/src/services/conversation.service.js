const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the teacher-parent messaging service (Md/API2.md, section 9). */
export default class ConversationService {
  /**
   * @returns {Promise<{ items: object[] }>} everyone the user may talk to, most recent conversation first
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
   * @returns {Promise<{ items: object[] }>} oldest first; rejects with ForbiddenError for a stranger
   */
  async getMessages(user, peerId, query) {
    throw notImplemented('getMessages')
  }

  /**
   * @returns {Promise<object>} the new message
   */
  async send(user, peerId, dto) {
    throw notImplemented('send')
  }

  /**
   * @returns {Promise<void>}
   */
  async markRead(user, peerId) {
    throw notImplemented('markRead')
  }
}
