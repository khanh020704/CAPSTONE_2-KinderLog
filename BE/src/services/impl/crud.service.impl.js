import mongoose from 'mongoose'
import { NotFoundError } from '../../utils/errors.js'

const DEFAULT_SIZE = 20
const MAX_SIZE = 100

/**
 * Mongoose implementation of CrudService, applied on top of an entity's own contract:
 *   class StudentServiceImpl extends crudServiceImpl(StudentService) { ... }
 */
export const crudServiceImpl = (Contract) =>
  class extends Contract {
    constructor(Model, toResponse) {
      super()
      this.Model = Model
      this.toResponse = toResponse
    }

    notFound(id) {
      return new NotFoundError(`${this.Model.modelName} ${id} was not found.`)
    }

    // Loads the document itself, for implementations that need more than the response DTO.
    async findDocument(id) {
      const doc = mongoose.isValidObjectId(id) ? await this.Model.findById(id) : null
      if (!doc) throw this.notFound(id)
      return doc
    }

    async findAll(filter = {}, { page = 1, size = DEFAULT_SIZE, sort = { _id: -1 } } = {}) {
      page = Math.max(1, Number(page) || 1)
      size = Math.min(MAX_SIZE, Math.max(1, Number(size) || DEFAULT_SIZE))
      const [docs, total] = await Promise.all([
        this.Model.find(filter).sort(sort).skip((page - 1) * size).limit(size),
        this.Model.countDocuments(filter),
      ])
      return { items: docs.map(this.toResponse), page, size, total }
    }

    async findById(id) {
      return this.toResponse(await this.findDocument(id))
    }

    async create(dto) {
      return this.toResponse(await this.Model.create(dto))
    }

    async update(id, dto) {
      const doc = await this.findDocument(id)
      doc.set(dto)
      return this.toResponse(await doc.save())
    }

    async remove(id) {
      const doc = await this.findDocument(id)
      await doc.deleteOne()
    }
  }
