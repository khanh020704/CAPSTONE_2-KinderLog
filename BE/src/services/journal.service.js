const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the class journal service (Md/API2.md, sections 5 to 8).
 * draft (manual) or review (voice) -> approved -> published. Only the class teacher may use it.
 * A published journal can still be edited: it goes back to draft or review, and parents keep seeing
 * the published version until the change is approved and published again. */
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
   * Saves the draft. Changing an approved or published journal sends it back to draft or review.
   * @returns {Promise<object>}
   */
  async update(user, id, dto) {
    throw notImplemented('update')
  }

  /**
   * @returns {Promise<object>} rejects with InvalidStateError when the journal is empty, has open points, or is published and unchanged
   */
  async approve(user, id) {
    throw notImplemented('approve')
  }

  /**
   * Makes the journal visible to parents and notifies them. Publishing a change replaces the version parents
   * see and notifies only the parents it concerns: all of the class for a class section or photo, a child's
   * parents for that child's note.
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
   * The recording as text (Whisper, or the browser's transcript as a fallback), for the teacher to read and
   * correct before the draft is made. The recording is stored; nothing else is saved.
   * @returns {Promise<{ transcript: string, transcriptSource: 'whisper'|'browser', audioUrl: string|null }>}
   */
  async transcribe(user, dto) {
    throw notImplemented('transcribe')
  }

  /**
   * Turns what the teacher said into a draft. Nothing is saved.
   * @returns {Promise<{ transcript: string, sections: object, personal: object, audioUrl: string|null }>}
   */
  async voiceDraft(user, dto) {
    throw notImplemented('voiceDraft')
  }
}
