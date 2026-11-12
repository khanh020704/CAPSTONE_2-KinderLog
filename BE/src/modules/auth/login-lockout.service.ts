import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

/** Consecutive failed sign-ins before a phone number is blocked, and for how long (User Story 2.1). */
export const MAX_FAILED_LOGINS = Number(process.env.LOGIN_MAX_FAILED ?? 5);
export const LOGIN_LOCK_MS = Number(process.env.LOGIN_LOCK_MINUTES ?? 10) * 60_000;

/**
 * Counts failed sign-ins per phone number and blocks the number after MAX_FAILED_LOGINS in a row.
 * The state lives in Redis, so it survives a backend restart and is shared by every backend instance.
 * When Redis is unavailable the same rule runs from memory, so the lockout never silently turns off.
 */
@Injectable()
export class LoginLockoutService {
  private readonly memory = new Map<string, { count: number; until?: number }>();

  constructor(private readonly cache: CacheService) {}

  private failKey = (phone: string) => `login:fail:${phone}`;
  private lockKey = (phone: string) => `login:lock:${phone}`;

  /** Milliseconds the phone number is still blocked for; 0 when it may sign in. */
  async remainingMs(phone: string): Promise<number> {
    const fromRedis = await this.cache.remainingMs(this.lockKey(phone));
    const until = this.memory.get(phone)?.until ?? 0;
    const fromMemory = Math.max(0, until - Date.now());
    return Math.max(fromRedis ?? 0, fromMemory);
  }

  async recordFailure(phone: string): Promise<void> {
    // A failure streak older than one lock period no longer counts as "in a row".
    const count = await this.cache.increment(this.failKey(phone), Math.ceil(LOGIN_LOCK_MS / 1000));
    if (count !== null) {
      if (count < MAX_FAILED_LOGINS) return;
      if (await this.cache.setFor(this.lockKey(phone), '1', LOGIN_LOCK_MS)) {
        await this.cache.del(this.failKey(phone));
      } else {
        // Redis dropped between the two calls: block from memory instead.
        this.memory.set(phone, { count, until: Date.now() + LOGIN_LOCK_MS });
      }
      return;
    }
    const prev = this.memory.get(phone);
    const next = (prev?.until && prev.until <= Date.now() ? 0 : (prev?.count ?? 0)) + 1;
    this.memory.set(phone, {
      count: next,
      until: next >= MAX_FAILED_LOGINS ? Date.now() + LOGIN_LOCK_MS : undefined,
    });
  }

  async clear(phone: string): Promise<void> {
    this.memory.delete(phone);
    await this.cache.del(this.failKey(phone), this.lockKey(phone));
  }
}
