/**
 * Creates the first System Admin account so a new installation can be signed into. Does nothing when a System Admin
 * already exists, so it is safe to run on every deployment.
 *
 *   npm run db:seed:admin
 *
 * Reads ADMIN_PHONE (sign-in), ADMIN_PASSWORD, ADMIN_NAME and ADMIN_EMAIL from .env. ADMIN_PASSWORD must be at least
 * 10 characters with letters and digits; change it in My Profile → Change Password after the first sign-in.
 */
import * as bcrypt from 'bcryptjs';
import type { DataSource } from 'typeorm';
import { RecordStatus, UserRole } from '../../common/enums';
import { User } from '../../modules/users/entities/user.entity';

export interface AdminAccount {
  phone: string;
  password: string;
  fullName: string;
  email?: string | null;
}

export function adminFromEnv(env = process.env): AdminAccount {
  const phone = (env.ADMIN_PHONE ?? '').trim();
  const password = env.ADMIN_PASSWORD ?? '';
  if (!/^0\d{9}$/.test(phone)) {
    throw new Error(
      'Set ADMIN_PHONE in .env to a 10-digit phone number starting with 0 (it is the sign-in name).',
    );
  }
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Set ADMIN_PASSWORD in .env: at least 10 characters, with both letters and digits.');
  }
  return {
    phone,
    password,
    fullName: env.ADMIN_NAME?.trim() || 'System Administrator',
    email: env.ADMIN_EMAIL?.trim() || null,
  };
}

/** Returns the created admin, or null when a System Admin already exists. */
export async function seedAdmin(ds: DataSource, admin: AdminAccount): Promise<User | null> {
  const users = ds.getRepository(User);
  if (await users.exist({ where: { role: UserRole.SYSTEM_ADMIN } })) return null;
  return users.save(
    users.create({
      schoolId: null,
      fullName: admin.fullName,
      phone: admin.phone,
      email: admin.email ?? null,
      role: UserRole.SYSTEM_ADMIN,
      status: RecordStatus.ACTIVE,
      passwordHash: await bcrypt.hash(admin.password, Number(process.env.BCRYPT_ROUNDS ?? 10)),
    }),
  );
}

if (require.main === module) {
  void (async () => {
    const { default: dataSource } = await import('../data-source');
    try {
      const admin = adminFromEnv();
      await dataSource.initialize();
      const created = await seedAdmin(dataSource, admin);
      console.log(
        created
          ? `System Admin created: ${created.phone} (password: ADMIN_PASSWORD in .env). Change it after the first sign-in.`
          : 'A System Admin account already exists; nothing was changed.',
      );
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  })();
}
