/**
 * SQL Server has no "create database on first connect": this creates DB_NAME through the master database if it is
 * missing. Runs before migrations (npm run migration:run).
 */
import { config } from 'dotenv';
import sql from 'mssql';

config({ quiet: true });

async function main() {
  const name = process.env.DB_NAME ?? 'kinderlog';
  if (!/^\w+$/.test(name)) throw new Error(`Invalid DB_NAME: ${name}`);
  const pool = await sql.connect({
    server: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
  });
  const { recordset } = await pool.query<{ id: number | null }>(`SELECT DB_ID(N'${name}') AS id`);
  if (recordset[0].id === null) {
    await pool.query(`CREATE DATABASE [${name}]`);
    console.log(`Database ${name} created.`);
  } else {
    console.log(`Database ${name} already exists.`);
  }
  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
