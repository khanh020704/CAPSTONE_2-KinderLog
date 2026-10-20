// Parameterised SQL. Values in the template become parameters, never text of the query:
//   const rows = await all(sql`SELECT * FROM Students WHERE ClassID = ${classId} AND IsActive = 1`, executor)
// raw() inserts trusted text (table and column names from the code), list() a parenthesised IN list.
// `executor` is where the statement runs: a UnitOfWork's transaction, or the pool (the default, for scripts).
import { poolExecutor, sqlTypes } from '../config/database.js'

const RAW = Symbol('raw')
const LIST = Symbol('list')

export class Query {
  constructor(strings, values) {
    this.strings = strings
    this.values = values
  }
}

export const sql = (strings, ...values) => new Query([...strings], values)
export const raw = (text) => ({ [RAW]: String(text) })
// An empty list matches nothing: IN (NULL) is never true.
export const list = (values) => ({ [LIST]: [...values] })
// Joins queries (or raw text) with a separator, e.g. the conditions of a WHERE clause.
export function join(parts, separator = ', ') {
  if (!parts.length) return sql``
  const strings = ['']
  const values = []
  parts.forEach((part, index) => {
    if (index) {
      values.push(raw(separator))
      strings.push('')
    }
    values.push(part)
    strings.push('')
  })
  return new Query(strings, values)
}

// SQL Server type of a JavaScript value.
function typeOf(value) {
  const t = sqlTypes()
  if (value === null || value === undefined) return [t.NVarChar, null]
  if (typeof value === 'boolean') return [t.Bit, value]
  if (typeof value === 'number') return Number.isInteger(value) ? [Math.abs(value) > 2147483647 ? t.BigInt : t.Int, value] : [t.Float, value]
  if (value instanceof Date) return [t.DateTime2(3), value]
  return [t.NVarChar(t.MAX), String(value)]
}

// Flattens the template into text with @arg0, @arg1... and binds the values.
function build(query, executor) {
  const req = executor.request()
  let text = ''
  let n = 0
  const bind = (value) => {
    const name = `arg${n++}`
    const [type, v] = typeOf(value)
    req.input(name, type, v)
    return `@${name}`
  }
  const add = (q) => {
    q.strings.forEach((part, i) => {
      text += part
      if (i >= q.values.length) return
      const value = q.values[i]
      if (value instanceof Query) add(value)
      else if (value?.[RAW] !== undefined) text += value[RAW]
      else if (value?.[LIST]) text += value[LIST].length ? `(${value[LIST].map(bind).join(', ')})` : '(NULL)'
      else text += bind(value)
    })
  }
  add(query)
  return { req, text }
}

export async function all(query, executor = poolExecutor) {
  const { req, text } = build(query, executor)
  return (await req.query(text)).recordset ?? []
}

export async function one(query, executor = poolExecutor) {
  return (await all(query, executor))[0] ?? null
}

// Every result set, for a batch of several SELECTs.
export async function sets(query, executor = poolExecutor) {
  const { req, text } = build(query, executor)
  return (await req.query(text)).recordsets
}

// Runs a statement; resolves to the number of rows it changed.
export async function run(query, executor = poolExecutor) {
  const { req, text } = build(query, executor)
  const result = await req.query(text)
  return result.rowsAffected.reduce((a, b) => a + b, 0)
}

// Plain T-SQL text, for migrations. Batches are split on lines that say GO.
export async function exec(text, executor = poolExecutor) {
  for (const batch of text.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean)) await executor.request().batch(batch)
}
