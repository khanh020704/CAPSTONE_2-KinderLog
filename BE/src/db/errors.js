// SQL Server errors the API reports to the client, by error number.
import { columnFields, uniqueFields } from './table.js'

const UNIQUE_CONSTRAINT = 2627
const UNIQUE_INDEX = 2601
const REFERENCE_OR_CHECK = 547

const numberOf = (err) => err?.number ?? err?.originalError?.info?.number ?? err?.originalError?.number

// The unique constraint or index named in the message, e.g. "... constraint 'UQ_Users_Username' ..."
// or "... unique index 'UX_Users_Phone' ...".
const constraintOf = (err) => /(?:constraint|index) '([^']+)'/i.exec(err.message)?.[1] ?? ''

// True for a duplicate on `constraint` (any unique constraint when not given).
export function isDuplicate(err, constraint) {
  const number = numberOf(err)
  if (number !== UNIQUE_CONSTRAINT && number !== UNIQUE_INDEX) return false
  return !constraint || constraintOf(err) === constraint
}

// Fields of the duplicated value. SQL Server names an unnamed constraint UQ__Table__hash, so a prefix matches too.
export function duplicateFields(err) {
  const name = constraintOf(err)
  const known = uniqueFields.get(name) ?? [...uniqueFields].find(([prefix]) => prefix.endsWith('__') && name.startsWith(prefix))?.[1]
  return known ?? []
}

// A reference to a row that does not exist (insert or update), or a row still referenced (delete), or a CHECK.
export function referenceProblem(err) {
  if (numberOf(err) !== REFERENCE_OR_CHECK) return null
  if (/DELETE statement/i.test(err.message)) return { kind: 'in-use' }
  const column = /column '([^']+)'/i.exec(err.message)?.[1]
  return { kind: /CHECK constraint/i.test(err.message) ? 'check' : 'missing', field: column && (columnFields.get(column) ?? column) }
}
