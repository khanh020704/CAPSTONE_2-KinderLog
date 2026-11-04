import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

config({ quiet: true });

/** Shared by the Nest app (TypeOrmModule) and the TypeORM CLI (migrations / seed). */
export const dataSourceOptions: DataSourceOptions = {
  type: 'mssql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 1433),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.DB_LOGGING === 'true',
  // Local / Docker SQL Server uses a self-signed certificate
  options: { encrypt: false, trustServerCertificate: true },
};

export default new DataSource(dataSourceOptions);
