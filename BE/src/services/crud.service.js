const notImplemented = (name) => new Error(`${name} is not implemented`)

/**
 * Contract shared by every entity service. Implementations live in ./impl.
 * Methods take request DTOs and return response DTOs, never Mongoose documents.
 */
export default class CrudService {
  /**
   * @param {object} [filter] exact-match conditions, e.g. { classId }
   * @param {{ page?: number, size?: number, sort?: object }} [options]
   * @returns {Promise<{ items: object[], page: number, size: number, total: number }>}
   */
  async findAll(filter, options) {
    throw notImplemented('findAll')
  }

  /** @returns {Promise<object>} rejects with NotFoundError when the id does not exist */
  async findById(id) {
    throw notImplemented('findById')
  }

  /** @returns {Promise<object>} */
  async create(dto) {
    throw notImplemented('create')
  }

  /** @returns {Promise<object>} rejects with NotFoundError when the id does not exist */
  async update(id, dto) {
    throw notImplemented('update')
  }

  /** @returns {Promise<void>} rejects with NotFoundError when the id does not exist */
  async remove(id) {
    throw notImplemented('remove')
  }
}
