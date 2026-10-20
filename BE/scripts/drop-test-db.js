// Drops a throwaway database used by Debug/debug_api.py.
// It refuses any database whose name does not end in "_debug", so it can never touch real data.
import { DB_NAME, connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { exec } from '../src/db/sql.js'

const SUFFIX = '_debug'

try {
  if (!DB_NAME.endsWith(SUFFIX)) throw new Error(`Refusing to drop "${DB_NAME}": set DB_NAME to a name ending in "${SUFFIX}".`)
  await connectDatabase('master')
  const name = DB_NAME.replace(/]/g, ']]')
  // Open connections (a server that was just stopped) would block the drop.
  await exec(`IF DB_ID(N'${DB_NAME}') IS NOT NULL
    BEGIN
      ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE
      DROP DATABASE [${name}]
    END`)
  console.log(`Dropped ${DB_NAME}.`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
