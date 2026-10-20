// T-SQL snippets for migrations. Every statement checks first, so a migration can run on a database
// restored from the school's backup (BackUp/C2SE10_KinderLog_new.bak) as well as on an empty one.

// T-SQL variables live for the whole batch, so every snippet gets its own name.
let counter = 0
const variable = () => `@v${++counter}`

const lit = (text) => `N'${String(text).replace(/'/g, "''")}'`

export const createTable = (table, body) => `
IF OBJECT_ID(${lit(`dbo.${table}`)}, N'U') IS NULL
BEGIN
  CREATE TABLE dbo.[${table}] (${body})
END`

// A view, procedure or trigger, created from its definition when it does not exist yet.
export const createObject = (name, definition) => `IF OBJECT_ID(${lit(`dbo.${name}`)}) IS NULL EXEC (${lit(definition.trim())})`
export const dropObject = (name, kind) => `IF OBJECT_ID(${lit(`dbo.${name}`)}) IS NOT NULL DROP ${kind} dbo.[${name}]`

export const dropTable = (table) => `IF OBJECT_ID(${lit(`dbo.${table}`)}, N'U') IS NOT NULL DROP TABLE dbo.[${table}]`

export const addColumn = (table, column, definition) => `
IF COL_LENGTH(${lit(`dbo.${table}`)}, ${lit(column)}) IS NULL
  ALTER TABLE dbo.[${table}] ADD [${column}] ${definition}`

// Drops the column with the default, check constraints and indexes that use it.
export const dropColumn = (table, column, v = variable()) => `
IF COL_LENGTH(${lit(`dbo.${table}`)}, ${lit(column)}) IS NOT NULL
BEGIN
  DECLARE ${v} nvarchar(max) = N''
  SELECT ${v} += N'ALTER TABLE dbo.[${table}] DROP CONSTRAINT [' + d.name + N']; '
    FROM sys.default_constraints d JOIN sys.columns c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    WHERE d.parent_object_id = OBJECT_ID(${lit(`dbo.${table}`)}) AND c.name = ${lit(column)}
  SELECT ${v} += N'ALTER TABLE dbo.[${table}] DROP CONSTRAINT [' + k.name + N']; '
    FROM sys.check_constraints k
    WHERE k.parent_object_id = OBJECT_ID(${lit(`dbo.${table}`)}) AND k.definition LIKE ${lit(`%[[]${column}]%`)}
  SELECT ${v} += N'ALTER TABLE dbo.[${table}] DROP CONSTRAINT [' + f.name + N']; '
    FROM sys.foreign_keys f JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = f.object_id
    JOIN sys.columns c ON c.object_id = fc.parent_object_id AND c.column_id = fc.parent_column_id
    WHERE f.parent_object_id = OBJECT_ID(${lit(`dbo.${table}`)}) AND c.name = ${lit(column)}
  SELECT ${v} += N'DROP INDEX [' + i.name + N'] ON dbo.[${table}]; '
    FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(${lit(`dbo.${table}`)}) AND c.name = ${lit(column)} AND i.is_primary_key = 0 AND i.is_unique_constraint = 0
  EXEC sp_executesql ${v}
  ALTER TABLE dbo.[${table}] DROP COLUMN [${column}]
END`

// Replaces the column's default (named or not) with a named one.
export const setDefault = (table, column, expression, v = variable()) => `
BEGIN
  DECLARE ${v} sysname = (SELECT d.name FROM sys.default_constraints d
    JOIN sys.columns c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    WHERE d.parent_object_id = OBJECT_ID(${lit(`dbo.${table}`)}) AND c.name = ${lit(column)})
  IF ${v} IS NOT NULL EXEC (N'ALTER TABLE dbo.[${table}] DROP CONSTRAINT [' + ${v} + N']')
  ALTER TABLE dbo.[${table}] ADD CONSTRAINT [DF_${table}_${column}] DEFAULT ${expression} FOR [${column}]
END`

// Adds or replaces a CHECK constraint.
export const setCheck = (table, name, expression) => `
IF OBJECT_ID(${lit(`dbo.${name}`)}, N'C') IS NOT NULL ALTER TABLE dbo.[${table}] DROP CONSTRAINT [${name}]
ALTER TABLE dbo.[${table}] ADD CONSTRAINT [${name}] CHECK (${expression})`

export const dropConstraint = (table, name) => `
IF EXISTS (SELECT 1 FROM sys.objects WHERE name = ${lit(name)} AND parent_object_id = OBJECT_ID(${lit(`dbo.${table}`)}))
  ALTER TABLE dbo.[${table}] DROP CONSTRAINT [${name}]`

export const createIndex = (name, table, definition) => `
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = ${lit(name)} AND object_id = OBJECT_ID(${lit(`dbo.${table}`)}))
  CREATE ${definition}`

export const dropIndex = (name, table) => `
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = ${lit(name)} AND object_id = OBJECT_ID(${lit(`dbo.${table}`)}))
  DROP INDEX [${name}] ON dbo.[${table}]`

export const oneOf = (column, values, nullable = false) =>
  `${nullable ? `[${column}] IS NULL OR ` : ''}[${column}] IN (${values.map(lit).join(', ')})`

// Separates batches: statements that use a column added earlier must run in a later batch.
export const batches = (...parts) => parts.join('\nGO\n')
