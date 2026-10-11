const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the class journal service (Md/API2.md, sections 5 to 8).
 * draft (manual) or review (voice) -> approved -> published. Only the class teacher may use it. */
export default class JournalService {
  /**
   * @returns {Promise<{ items: object[] }>} newest first
   */
  async list(user, query) {
    throw notImplemented('list')
  }

  /**
   * @returns {Promise<object>}
   */
  async get(user, id) {
    throw notImplemented('get')
  }

  /**
   * @returns {Promise<object>} rejects with ConflictError (JOURNAL_EXISTS), ForbiddenError (AI_DISABLED)
   */
  async create(user, dto) {
    throw notImplemented('create')
  }

  /**
   * Saves the draft. Changing an approved journal sends it back to draft or review.
   * @returns {Promise<object>} rejects with InvalidStateError once published
   */
  async update(user, id, dto) {
    throw notImplemented('update')
  }

  /**
   * @returns {Promise<object>} rejects with InvalidStateError when the journal is empty or published
   */
  async approve(user, id) {
    throw notImplemented('approve')
  }

  /**
   * Makes the journal visible to parents and notifies them.
   * @returns {Promise<object>} rejects with InvalidStateError unless the journal is approved
   */
  async publish(user, id) {
    throw notImplemented('publish')
  }

  /**
   * Appends another recording to the draft and sends it back to review.
   * @returns {Promise<object>}
   */
  async addRecording(user, id, dto) {
    throw notImplemented('addRecording')
  }

  /**
   * Turns what the teacher said into a draft. Nothing is saved.
   * @returns {Promise<{ transcript: string, sections: object, personal: object, audioUrl: string|null }>}
   */
  async voiceDraft(user, dto) {
    throw notImplemented('voiceDraft')
  }
}
