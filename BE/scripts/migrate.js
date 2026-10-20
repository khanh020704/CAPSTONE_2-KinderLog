// Runs the files in src/migrations in name order and records them in the Schema_Migrations table.
// The database (DB_NAME in BE/.env) is created first when it does not exist yet.
//   npm run migrate          apply every pending migration
//   npm run migrate:down     undo the most recent one
//   npm run migrate:status   list applied and pending migrations
import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { DB_NAME, connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { all, exec, run, sql } from '../src/db/sql.js'

const DIR = path.resolve(import.meta.dirname, '../src/migrations')
const command = process.argv[2] || 'up'

const load = (file) => import(pathToFileURL(path.join(DIR, file)).href)

async function ensureDatabase() {
  await connectDatabase('master')
  const name = DB_NAME.replace(/]/g, ']]')
  await exec(`IF DB_ID(N'${DB_NAME.replace(/'/g, "''")}') IS NULL CREATE DATABASE [${name}]`)
  await disconnectDatabase()
}

try {
  if (command === 'up') await ensureDatabase()
  await connectDatabase()
  await exec(`
    IF OBJECT_ID(N'dbo.Schema_Migrations', N'U') IS NULL
      CREATE TABLE dbo.Schema_Migrations (Name nvarchar(200) NOT NULL PRIMARY KEY, AppliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME())`)
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.js')).sort()
  const applied = new Set((await all(sql`SELECT Name FROM dbo.Schema_Migrations`)).map((m) => m.Name))
  console.log(`Database: ${DB_NAME}`)

  if (command === 'status') {
    for (const file of files) console.log(`${applied.has(file) ? 'applied' : 'pending'}  ${file}`)
  } else if (command === 'up') {
    const pending = files.filter((f) => !applied.has(f))
    for (const file of pending) {
      await (await load(file)).up()
      await run(sql`INSERT dbo.Schema_Migrations (Name, AppliedAt) VALUES (${file}, ${new Date()})`)
      console.log(`applied   ${file}`)
    }
    if (!pending.length) console.log('Nothing to migrate.')
  } else if (command === 'down') {
    const last = files.filter((f) => applied.has(f)).pop()
    if (!last) {
      console.log('Nothing to undo.')
    } else {
      await (await load(last)).down()
      await run(sql`DELETE FROM dbo.Schema_Migrations WHERE Name = ${last}`)
      console.log(`reverted  ${last}`)
    }
  } else {
    throw new Error(`Unknown command "${command}". Use up, down or status.`)
  }
} catch (err) {
  console.error(`Migration failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
