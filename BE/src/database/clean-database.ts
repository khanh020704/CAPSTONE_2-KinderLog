/**
 * Empties every table and the uploaded files, then creates the first System Admin from .env — the state of a fresh
 * installation. The schema (migrations) is kept.
 *
 *   npm run db:clean -- --yes
 */
import { readdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { DataSource } from 'typeorm';
import { adminFromEnv, seedAdmin } from './seeds/admin.seed';

/** Children before parents: SQL Server has no TRUNCATE … CASCADE. */
export const DATA_TABLES = [
  'audit_logs',
  'notifications',
  'messages',
  'school_announcements',
  'semesters',
  'attribute_fields',
  'system_settings',
  'academic_years',
  'journal_photos',
  'daily_journals',
  'class_journal_notes',
  'class_journals',
  'camera_streams',
  'parent_student_map',
  'students',
  'classes',
  'users',
  'schools',
] as const;

export async function cleanDatabase(ds: DataSource) {
  await ds.transaction(async (tx) => {
    for (const table of DATA_TABLES) await tx.query(`DELETE FROM ${table}`);
  });
}

/** Removes uploaded photos (UPLOAD_DIR/photos); returns how many files were deleted. */
export function cleanUploads(uploadDir = process.env.UPLOAD_DIR ?? 'uploads'): number {
  const dir = join(uploadDir, 'photos');
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const f of files) rmSync(join(dir, f), { recursive: true, force: true });
  return files.length;
}

if (require.main === module) {
  void (async () => {
    if (!process.argv.includes('--yes')) {
      console.error('This deletes ALL data and uploaded files. Run again with: npm run db:clean -- --yes');
      process.exitCode = 1;
      return;
    }
    const { default: dataSource } = await import('./data-source');
    try {
      const admin = adminFromEnv(); // fail before deleting anything if the admin settings are missing
      await dataSource.initialize();
      await cleanDatabase(dataSource);
      const files = cleanUploads();
      await seedAdmin(dataSource, admin);
      console.log(`Database ${process.env.DB_NAME} emptied, ${files} uploaded file(s) removed.`);
      console.log(
        `System Admin: ${admin.phone} (password: ADMIN_PASSWORD in .env). Change it after the first sign-in.`,
      );
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  })();
}
