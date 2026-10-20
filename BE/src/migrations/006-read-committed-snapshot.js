// Readers no longer wait for writers. By default SQL Server makes a read wait while a transaction is writing
// the same rows: a parent's portal, polling every 10 seconds, waited behind a teacher's save, and under load
// the reads ran into the 15-second query timeout. With READ_COMMITTED_SNAPSHOT a read sees the last committed
// version of the rows instead. Transactions that write still lock each other as before, so a unit of work stays
// all-or-nothing.
//
// Switching it needs the database to itself for a moment: other connections (a running server) are ended and
// reconnect on their next query.
import { exec } from '../db/sql.js'

const setSnapshot = (on) => `
DECLARE @db sysname = DB_NAME()
IF (SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = @db) <> ${on ? 1 : 0}
  EXEC (N'ALTER DATABASE [' + @db + N'] SET READ_COMMITTED_SNAPSHOT ${on ? 'ON' : 'OFF'} WITH ROLLBACK IMMEDIATE')`

export async function up() {
  await exec(setSnapshot(true))
}

export async function down() {
  await exec(setSnapshot(false))
}
