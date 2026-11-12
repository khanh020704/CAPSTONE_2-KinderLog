/**
 * SQL Server has no "create database on first connect": this creates DB_NAME through the master database if it is
 * missing. Runs before migrations (npm run migration:run) and before the E2E suite (for its own test database).
 */
import { config } from 'dotenv';
import sql from 'mssql';

config({ quiet: true });

/** Creates the database if it does not exist yet; returns true when it was created. */
export async function ensureDatabase(name = process.env.DB_NAME ?? 'kinderlog'): Promise<boolean> {
  if (!/^\w+$/.test(name)) throw new Error(`Invalid DB_NAME: ${name}`);
  const pool = await sql.connect({
    server: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
  });
  try {
    const { recordset } = await pool.query<{ id: number | null }>(`SELECT DB_ID(N'${name}') AS id`);
    if (recordset[0].id !== null) return false;
    await pool.query(`CREATE DATABASE [${name}]`);
    return true;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  const name = process.env.DB_NAME ?? 'kinderlog';
  ensureDatabase(name)
    .then((created) =>
      console.log(created ? `Database ${name} created.` : `Database ${name} already exists.`),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
