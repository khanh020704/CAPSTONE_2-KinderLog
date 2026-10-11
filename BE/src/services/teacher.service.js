const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the teacher's home screens (Md/API2.md, sections 3 and 10). */
export default class TeacherService {
  /**
   * @returns {Promise<{ class: object, students: object[] }>} rejects with NotFoundError (NO_CLASS)
   */
  async getClass(user) {
    throw notImplemented('getClass')
  }

  /**
   * @returns {Promise<object>} today's numbers; `class` is null when the teacher has no class
   */
  async getDashboard(user) {
    throw notImplemented('getDashboard')
  }
}
