// Building blocks for migrations that create or change a collection's validation rules.

export const str = (maxLength) => ({ bsonType: 'string', ...(maxLength && { maxLength }) })
export const oneOf = (...values) => ({ bsonType: 'string', enum: values })
export const day = { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } // calendar date, 'YYYY-MM-DD'
export const id = { bsonType: 'objectId' }
export const bool = { bsonType: 'bool' }
export const num = { bsonType: 'number' }
export const date = { bsonType: 'date' }
export const listOf = (items) => ({ bsonType: 'array', items })
export const objectOf = (required, properties) => ({ bsonType: 'object', required, properties })
export const any = {}

export const unique = { unique: true }

const nullable = ({ bsonType, enum: values, ...rest }) =>
  bsonType === undefined ? rest : { bsonType: [bsonType, 'null'], ...(values && { enum: [...values, null] }), ...rest }

// `required` lists the fields that must be present; every other field may be missing or null.
export function validatorOf({ required, fields, rule }) {
  const properties = Object.fromEntries(
    Object.entries(fields).map(([name, type]) => [name, required.includes(name) ? type : nullable(type)]),
  )
  const schema = { $jsonSchema: { bsonType: 'object', required, properties } }
  return rule ? { $and: [schema, rule] } : schema
}

export const collectionNames = async (db) =>
  new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))

// Creates the collection, or replaces the rules of an existing one, then makes sure its indexes exist.
export async function applyCollection(db, existing, name, definition) {
  const validator = validatorOf(definition)
  if (existing.has(name)) await db.command({ collMod: name, validator, validationLevel: 'strict' })
  else await db.createCollection(name, { validator, validationLevel: 'strict' })
  for (const [keys, options = {}] of definition.indexes || []) await db.collection(name).createIndex(keys, options)
}
