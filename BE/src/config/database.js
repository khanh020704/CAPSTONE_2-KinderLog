// Connection to SQL Server. Two ways to sign in, chosen by BE/.env:
//   - Windows account (default): DB_SERVER=(local)\SQLEXPRESS, no DB_USER. Uses the ODBC driver (msnodesqlv8),
//     so it works with a local SQL Server Express that only allows Windows sign-in and has TCP/IP turned off.
//   - SQL Server login: DB_USER and DB_PASSWORD set. Uses TCP (tedious): DB_SERVER=host, DB_PORT=1433.
//
// The application reaches the database through a UnitOfWork (src/db/unit-of-work.js), which runs its
// statements on an executor from here: the connection pool, or one transaction.

export const DB_NAME = process.env.DB_NAME || 'KinderLog'
const server = process.env.DB_SERVER || '(local)\\SQLEXPRESS'
const odbcDriver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server'
const sqlLogin = !!process.env.DB_USER

let sql // the mssql module of the driver in use
let pool = null

async function driver() {
  sql ??= (await import(sqlLogin ? 'mssql' : 'mssql/msnodesqlv8.js')).default
  return sql
}

// `database` lets scripts connect to master, e.g. to create or drop the database itself.
async function connectionConfig(database) {
  if (sqlLogin) {
    return {
      server,
      port: Number(process.env.DB_PORT) || 1433,
      database,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: true },
      pool: { max: 10 },
    }
  }
  return {
    connectionString: `Driver={${odbcDriver}};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`,
    pool: { max: 10 },
  }
}

export async function connectDatabase(database = DB_NAME) {
  if (pool) return pool
  await driver()
  pool = await new sql.ConnectionPool(await connectionConfig(database)).connect()
  return pool
}

export async function disconnectDatabase() {
  const closing = pool
  pool = null
  await closing?.close()
}

export const isDatabaseConnected = () => !!pool?.connected

const requirePool = () => {
  if (!pool) throw new Error('The database is not connected.')
  return pool
}

// Every statement on its own: for reads, and for scripts and migrations.
export const poolExecutor = {
  transactional: false,
  request: () => new sql.Request(requirePool()),
}

// One transaction: every statement made through it is committed or rolled back together.
// Its statements must run one after another, as a transaction has a single connection.
export async function beginTransaction() {
  const tx = new sql.Transaction(requirePool())
  await tx.begin()
  return {
    transactional: true,
    request: () => new sql.Request(tx),
    commit: () => tx.commit(),
    rollback: () => tx.rollback(),
  }
}

export const sqlTypes = () => sql
