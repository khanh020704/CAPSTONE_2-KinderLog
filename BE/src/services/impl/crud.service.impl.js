import { UnitOfWork } from '../../db/unit-of-work.js'
import { NotFoundError } from '../../utils/errors.js'

const DEFAULT_SIZE = 20
const MAX_SIZE = 100

/**
 * SQL Server implementation of CrudService on a table of src/models, applied on top of an entity's own contract:
 *   class StudentServiceImpl extends crudServiceImpl(StudentService) { ... }
 * Reads use a reading unit of work; every write is one transaction.
 */
export const crudServiceImpl = (Contract) =>
  class extends Contract {
    constructor(table, toResponse) {
      super()
      this.table = table
      this.toResponse = toResponse
    }

    notFound(id) {
      return new NotFoundError(`${this.table.name} ${id} was not found.`)
    }

    // The table's repository in `uow`.
    repo(uow) {
      return uow.of(this.table)
    }

    async findAll(filter = {}, { page = 1, size = DEFAULT_SIZE } = {}) {
      page = Math.max(1, Number(page) || 1)
      size = Math.min(MAX_SIZE, Math.max(1, Number(size) || DEFAULT_SIZE))
      const repo = this.repo(UnitOfWork.read())
      const rows = await repo.find(filter, { orderBy: [['id', 'DESC']], limit: size, offset: (page - 1) * size })
      const total = await repo.count(filter)
      return { items: rows.map(this.toResponse), page, size, total }
    }

    async findById(id) {
      const row = await this.repo(UnitOfWork.read()).findById(id)
      if (!row) throw this.notFound(id)
      return this.toResponse(row)
    }

    async create(dto) {
      return this.toResponse(await UnitOfWork.run((uow) => this.repo(uow).insert(dto)))
    }

    async update(id, dto) {
      const row = await UnitOfWork.run((uow) => this.repo(uow).updateById(id, dto))
      if (!row) throw this.notFound(id)
      return this.toResponse(row)
    }

    async remove(id) {
      if (!(await UnitOfWork.run((uow) => this.repo(uow).removeById(id)))) throw this.notFound(id)
    }
  }
