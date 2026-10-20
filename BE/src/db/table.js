// A table of the database described once, in the code's own words (camelCase fields). Its repository holds
// the plain operations every table needs: find, count, insert, update, remove. A repository is always
// bound to a UnitOfWork (src/db/unit-of-work.js): `uow.students.find(...)` runs in that unit's transaction.
// Rows come back as plain objects: the key as `id`, references as strings, calendar dates as 'YYYY-MM-DD',
// timestamps as Date.
//
// Field types:
//   id        a reference to another table's key (INT); a string of digits in the code and the API
//   string    nvarchar(max) with an optional `max` length, `enum` list or `match` pattern
//   text      nvarchar(max)
//   int, number, bool
//   date      a calendar date, 'YYYY-MM-DD'
//   datetime  a point in time (stored in UTC)
//   json      any value, stored as JSON text
// Options: required, default (a value or a function), column (when not the PascalCase of the field,
// with "Id" written "ID"), hidden (left out unless asked for), auto: 'created' | 'updated'.
import { BadRequestError } from '../utils/errors.js'
import { isDateOnly } from '../utils/text.js'
import { all, join, list, one, raw, run, sql } from './sql.js'

const MAX_INT = 2147483647
const registry = new Map()
// Unique constraint or index name -> fields, so a duplicate can be reported by field.
export const uniqueFields = new Map()
// Column name -> field name, so a database error about a column can be reported by field.
export const columnFields = new Map()

export const isId = (value) =>
  (typeof value === 'string' || typeof value === 'number') && /^\d{1,10}$/.test(String(value)) && Number(value) > 0 && Number(value) <= MAX_INT

const columnOf = (field) => field.charAt(0).toUpperCase() + field.slice(1).replace(/Id$/, 'ID')
const quote = (name) => `[${name}]`
const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
const formatDay = (d) => d.toISOString().slice(0, 10)

// The value a client or the code sent, made the field's type; `error` when it cannot be.
function coerce(spec, value) {
  if (value === null || value === undefined) return { value: null }
  switch (spec.type) {
    case 'id':
      return isId(value) ? { value: String(value) } : { error: 'Invalid id.' }
    case 'int': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
      return Number.isInteger(n) ? { value: n } : { error: 'Enter a whole number.' }
    }
    case 'number': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
      return typeof n === 'number' && Number.isFinite(n) ? { value: n } : { error: 'Enter a number.' }
    }
    case 'bool':
      if (typeof value === 'boolean') return { value }
      if (value === 'true' || value === 'false') return { value: value === 'true' }
      return { error: 'Use true or false.' }
    case 'date':
      if (value instanceof Date && !Number.isNaN(value.getTime())) return { value: formatDay(value) }
      return isDateOnly(value) ? { value } : { error: 'Use the date format YYYY-MM-DD.' }
    case 'datetime': {
      const d = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null
      return d && !Number.isNaN(d.getTime()) ? { value: d } : { error: 'Invalid date.' }
    }
    case 'json':
      return { value }
    default: {
      if (typeof value !== 'string' && typeof value !== 'number') return { error: 'Enter text.' }
      const text = String(value)
      if (spec.max && text.length > spec.max) return { error: `Keep it under ${spec.max} characters.` }
      if (spec.enum && !spec.enum.includes(text)) return { error: `Use one of: ${spec.enum.join(', ')}.` }
      if (spec.match && !spec.match.test(text)) return { error: 'Invalid format.' }
      return { value: text }
    }
  }
}

const toDb = (spec, value) => {
  if (value === null || value === undefined) return null
  if (spec.type === 'id') return Number(value)
  if (spec.type === 'json') return JSON.stringify(value)
  return value
}

function fromDb(spec, value) {
  if (value === null || value === undefined) return null
  switch (spec.type) {
    case 'id':
      return String(value)
    case 'int':
    case 'number':
      return Number(value)
    case 'bool':
      return Boolean(value)
    case 'date':
      return value instanceof Date ? formatDay(value) : String(value).slice(0, 10)
    case 'datetime':
      return value instanceof Date ? new Date(value.getTime()) : new Date(value)
    case 'json':
      return typeof value === 'string' ? JSON.parse(value) : value
    default:
      return value
  }
}

const invalid = (fields) => new BadRequestError('Some fields are invalid.', fields)

export function defineTable({ name, table, key, fields, uniques = {}, validate, defaultOrder = [['id', 'DESC']] }) {
  const specs = Object.fromEntries(Object.entries(fields).map(([field, spec]) => [field, { column: columnOf(field), ...spec }]))
  const keySpec = { type: 'id', column: key }
  const specOf = (field) => (field === 'id' ? keySpec : specs[field])
  for (const [constraint, names] of Object.entries(uniques)) uniqueFields.set(constraint, names)
  for (const [field, spec] of Object.entries(specs)) columnFields.set(spec.column, field)

  const visible = Object.keys(specs).filter((f) => !specs[f].hidden)
  const selectList = (hidden) => raw([key, ...(hidden ? Object.keys(specs) : visible).map((f) => specs[f].column)].map(quote).join(', '))

  function toRow(record) {
    if (!record) return null
    const row = { id: String(record[key]) }
    for (const [field, spec] of Object.entries(specs)) if (spec.column in record) row[field] = fromDb(spec, record[spec.column])
    return row
  }

  // ---------- WHERE ----------
  // { field: value } equality, null -> IS NULL, an array -> IN, { $ne, $gt, $gte, $lt, $lte, $in, $nin } and $or.
  function condition(field, value) {
    const spec = specOf(field)
    if (!spec) throw new Error(`${name} has no field "${field}".`)
    const col = raw(quote(spec.column))
    const typed = (v) => {
      const { value: c, error } = coerce(spec, v)
      if (error) throw invalid({ [field]: error })
      return toDb(spec, c)
    }
    if (value === null || value === undefined) return sql`${col} IS NULL`
    if (Array.isArray(value)) return sql`${col} IN ${list(value.map(typed))}`
    if (isPlain(value)) {
      const parts = Object.entries(value).map(([op, v]) => {
        switch (op) {
          case '$ne':
            return v === null ? sql`${col} IS NOT NULL` : sql`(${col} <> ${typed(v)} OR ${col} IS NULL)`
          case '$gt':
            return sql`${col} > ${typed(v)}`
          case '$gte':
            return sql`${col} >= ${typed(v)}`
          case '$lt':
            return sql`${col} < ${typed(v)}`
          case '$lte':
            return sql`${col} <= ${typed(v)}`
          case '$in':
            return sql`${col} IN ${list(v.map(typed))}`
          case '$nin':
            return v.length ? sql`${col} NOT IN ${list(v.map(typed))}` : sql`1 = 1`
          default:
            throw new Error(`Unknown operator ${op}.`)
        }
      })
      return join(parts, ' AND ')
    }
    return sql`${col} = ${typed(value)}`
  }

  function where(filter = {}) {
    const parts = Object.entries(filter)
      .filter(([, v]) => v !== undefined)
      .map(([field, value]) =>
        field === '$or'
          ? sql`(${join(
              value.map((w) => sql`(${where(w)})`),
              ' OR ',
            )})`
          : condition(field, value),
      )
    return parts.length ? join(parts, ' AND ') : sql`1 = 1`
  }

  const orderList = (orderBy) =>
    raw(orderBy.map(([field, dir = 'ASC']) => `${quote(specOf(field).column)} ${String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`).join(', '))

  // ---------- writes ----------
  // Checks what is written: types, lengths and lists always; required fields when the whole record is.
  function prepare(values, { whole }) {
    const out = {}
    const errors = {}
    for (const [field, spec] of Object.entries(specs)) {
      let value = values[field]
      if (value === undefined && whole && spec.default !== undefined) value = typeof spec.default === 'function' ? spec.default() : spec.default
      if (value === undefined) {
        if (whole && spec.required && !spec.auto) errors[field] = `${field} is required.`
        continue
      }
      const { value: c, error } = coerce(spec, value)
      if (error) errors[field] = error
      else if (spec.required && (c === null || c === '')) errors[field] = `${field} is required.`
      else out[field] = c
    }
    if (Object.keys(errors).length) throw invalid(errors)
    return out
  }

  function stamp(out, { created }) {
    const now = new Date()
    for (const [field, spec] of Object.entries(specs)) {
      if (spec.auto === 'updated' || (created && spec.auto === 'created')) out[field] = now
    }
    return out
  }

  // The operations, run on `executor` (a UnitOfWork's transaction or the pool).
  const repository = (executor) => {
    const repo = {
      name,

      async find(filter = {}, { orderBy = defaultOrder, limit, offset = 0, hidden = false } = {}) {
        const paging =
          limit !== undefined ? sql` OFFSET ${Number(offset)} ROWS FETCH NEXT ${Number(limit)} ROWS ONLY` : offset ? sql` OFFSET ${Number(offset)} ROWS` : sql``
        const rows = await all(
          sql`SELECT ${selectList(hidden)} FROM ${raw(quote(table))} WHERE ${where(filter)} ORDER BY ${orderList(orderBy)}${paging}`,
          executor,
        )
        return rows.map(toRow)
      },

      async findOne(filter = {}, { orderBy = defaultOrder, hidden = false } = {}) {
        return toRow(
          await one(sql`SELECT TOP 1 ${selectList(hidden)} FROM ${raw(quote(table))} WHERE ${where(filter)} ORDER BY ${orderList(orderBy)}`, executor),
        )
      },

      // null for an id that is malformed or does not exist.
      async findById(id, options) {
        return isId(id) ? repo.findOne({ id }, options) : null
      },

      async count(filter = {}) {
        return Number((await one(sql`SELECT COUNT(*) AS n FROM ${raw(quote(table))} WHERE ${where(filter)}`, executor)).n)
      },

      async exists(filter) {
        return !!(await one(sql`SELECT TOP 1 1 AS found FROM ${raw(quote(table))} WHERE ${where(filter)}`, executor))
      },

      async insert(values) {
        const out = stamp(prepare(values, { whole: true }), { created: true })
        if (validate) {
          const errors = validate(out)
          if (errors && Object.keys(errors).length) throw invalid(errors)
        }
        const cols = Object.keys(out)
        // The new key goes through a table variable: a table with triggers (Users, Daily_Journals in the
        // school's database) cannot return rows straight from OUTPUT. Reading the row back also shows what
        // the triggers changed.
        const record = await one(
          sql`
        DECLARE @keys TABLE (k bigint);
        INSERT INTO ${raw(quote(table))} (${raw(cols.map((f) => quote(specs[f].column)).join(', '))})
        OUTPUT INSERTED.${raw(quote(key))} INTO @keys
        VALUES (${join(cols.map((f) => sql`${toDb(specs[f], out[f])}`))});
        SELECT ${selectList(false)} FROM ${raw(quote(table))} WHERE ${raw(quote(key))} IN (SELECT k FROM @keys);`,
          executor,
        )
        return toRow(record)
      },

      // Updates every row the filter matches; resolves to the updated rows.
      async update(filter, values) {
        const out = stamp(prepare(values, { whole: false }), { created: false })
        if (!Object.keys(out).length) return repo.find(filter)
        const sets = Object.keys(out).map((f) => sql`${raw(quote(specs[f].column))} = ${toDb(specs[f], out[f])}`)
        // One statement decides which rows change, so a claim such as "unused token -> used" happens once.
        const records = await all(
          sql`
        DECLARE @keys TABLE (k bigint);
        UPDATE ${raw(quote(table))} SET ${join(sets)}
        OUTPUT INSERTED.${raw(quote(key))} INTO @keys
        WHERE ${where(filter)};
        SELECT ${selectList(false)} FROM ${raw(quote(table))} WHERE ${raw(quote(key))} IN (SELECT k FROM @keys) ORDER BY ${raw(quote(key))};`,
          executor,
        )
        return records.map(toRow)
      },

      // The updated row, or null when the id does not exist.
      async updateById(id, values) {
        if (!isId(id)) return null
        if (validate) {
          const current = await repo.findById(id)
          if (!current) return null
          const errors = validate({ ...current, ...prepare(values, { whole: false }) })
          if (errors && Object.keys(errors).length) throw invalid(errors)
        }
        return (await repo.update({ id }, values))[0] ?? null
      },

      async remove(filter) {
        return run(sql`DELETE FROM ${raw(quote(table))} WHERE ${where(filter)}`, executor)
      },

      async removeById(id) {
        return isId(id) && (await repo.remove({ id })) > 0
      },
    }
    return repo
  }

  const definition = { name, table, key, fields: specs, toRow, where, repository }
  registry.set(name, definition)
  return definition
}

export const tableNamed = (name) => registry.get(name)
