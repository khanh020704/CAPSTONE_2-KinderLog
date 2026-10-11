const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the platform settings service. */
export default class SettingsService {
  /**
   * @returns {Promise<object>} every setting, with defaults for the ones not stored yet
   */
  async get() {
    throw notImplemented('get')
  }

  /**
   * @returns {Promise<object>} the settings a page may read before sign-in
   */
  async getPublic() {
    throw notImplemented('getPublic')
  }

  /**
   * @returns {Promise<object>} the settings after saving
   */
  async update(user, dto) {
    throw notImplemented('update')
  }
}
