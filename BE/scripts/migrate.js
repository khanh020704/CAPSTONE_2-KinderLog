// Runs the files in src/migrations in name order and records them in the `migrations` collection.
//   npm run migrate          apply every pending migration
//   npm run migrate:down     undo the most recent one
//   npm run migrate:status   list applied and pending migrations
import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'

const DIR = path.resolve(import.meta.dirname, '../src/migrations')
const command = process.argv[2] || 'up'

const load = (file) => import(pathToFileURL(path.join(DIR, file)).href)

try {
  await connectDatabase()
  const db = mongoose.connection.db
  const log = db.collection('migrations')
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.js')).sort()
  const applied = new Set((await log.find().toArray()).map((m) => m.name))
  console.log(`Database: ${db.databaseName}`)

  if (command === 'status') {
    for (const file of files) console.log(`${applied.has(file) ? 'applied' : 'pending'}  ${file}`)
  } else if (command === 'up') {
    const pending = files.filter((f) => !applied.has(f))
    for (const file of pending) {
      await (await load(file)).up(db)
      await log.insertOne({ name: file, appliedAt: new Date() })
      console.log(`applied   ${file}`)
    }
    if (!pending.length) console.log('Nothing to migrate.')
  } else if (command === 'down') {
    const last = files.filter((f) => applied.has(f)).pop()
    if (!last) {
      console.log('Nothing to undo.')
    } else {
      await (await load(last)).down(db)
      await log.deleteOne({ name: last })
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
