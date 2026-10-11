const notImplemented = (name) => new Error(`${name} is not implemented`)

/** Contract of the daily attendance sheet of a class (Md/API2.md, section 4). */
export default class AttendanceSheetService {
  /**
   * @returns {Promise<object>} the sheet of one class on one day; empty when nothing was recorded
   */
  async getSheet(user, query) {
    throw notImplemented('getSheet')
  }

  /**
   * Replaces the whole sheet of the teacher's class for one day.
   * @returns {Promise<object>} the saved sheet
   */
  async saveSheet(user, dto) {
    throw notImplemented('saveSheet')
  }
}
