import { DataSource } from 'typeorm';
import { ensureDatabase } from '../src/database/create-database';
import { dataSourceOptions } from '../src/database/data-source';

/** Creates the test database on first use and brings its schema up to date with the migrations. */
export async function prepareTestDatabase() {
  await ensureDatabase(process.env.DB_NAME);
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();
  try {
    await ds.runMigrations();
  } finally {
    await ds.destroy();
  }
}
