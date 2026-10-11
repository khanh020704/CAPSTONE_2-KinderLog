// Drops a throwaway database used by Debug/debug_api.py.
// It refuses any database whose name does not end in "_debug", so it can never touch real data.
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'

const SUFFIX = '_debug'

try {
  await connectDatabase()
  const db = mongoose.connection.db
  if (!db.databaseName.endsWith(SUFFIX)) {
    throw new Error(`Refusing to drop "${db.databaseName}": set MONGODB_DB to a name ending in "${SUFFIX}".`)
  }
  await db.dropDatabase()
  console.log(`Dropped ${db.databaseName}.`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
