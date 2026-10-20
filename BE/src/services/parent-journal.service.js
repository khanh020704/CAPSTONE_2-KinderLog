const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the parent's view of the class journal (Md/API.md, section 8.4).
 * A parent reads the published version of the journals of their child's class, with only that child's
 * personal note and attendance. The child must be linked to the parent by an active link. */
export default class ParentJournalService {
  /**
   * @returns {Promise<{ items: object[] }>} published journals, newest first; rejects with ForbiddenError for another child
   */
  async list(user, query) {
    throw notImplemented('list')
  }

  /**
   * @returns {Promise<object>} rejects with NotFoundError when nothing was published for that day
   */
  async byDate(user, query) {
    throw notImplemented('byDate')
  }
}
