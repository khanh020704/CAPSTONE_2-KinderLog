// Query-string values that are not plain strings (repeated keys become arrays) are ignored as filters.
const stringsOnly = (query) => Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === 'string'))

/**
 * The five REST handlers every entity shares. List filters are exact matches on
 * the entity's own fields, e.g. GET /students?classId=...&isActive=true&page=2&size=20
 */
export function crudController(service, { toCreateDto, toUpdateDto, toFilterDto = toUpdateDto }) {
  return {
    async list(req, res) {
      const { page, size, ...query } = req.query
      res.json(await service.findAll(toFilterDto(stringsOnly(query)), { page, size }))
    },

    async get(req, res) {
      res.json(await service.findById(req.params.id))
    },

    async create(req, res) {
      res.status(201).json(await service.create(toCreateDto(req.body)))
    },

    async update(req, res) {
      res.json(await service.update(req.params.id, toUpdateDto(req.body)))
    },

    async remove(req, res) {
      await service.remove(req.params.id)
      res.status(204).end()
    },
  }
}
