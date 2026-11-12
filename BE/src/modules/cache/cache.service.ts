import {
  CallHandler,
  ExecutionContext,
  Global,
  Injectable,
  Logger,
  Module,
  NestInterceptor,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import Redis from 'ioredis';
import { mergeMap, Observable } from 'rxjs';

/**
 * Thin JSON cache over Redis. Fails open: if Redis is down or not configured the API computes the value
 * every time instead of erroring, so the API never breaks because of the cache.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private readonly ttl: number;

  constructor(config: ConfigService) {
    const url = config.get<string>('redisUrl');
    this.ttl = config.get<number>('cacheTtl') ?? 60;
    this.redis = url
      ? new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false })
      : null;
    this.redis?.on('error', (e) => this.logger.warn(`Redis unavailable: ${e.message}`));
  }

  async wrap<T>(key: string, compute: () => Promise<T>, ttl = this.ttl): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await compute();
    await this.set(key, value, ttl);
    return value;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis?.status !== 'ready') return null;
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttl = this.ttl): Promise<void> {
    if (this.redis?.status !== 'ready') return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      /* fail open */
    }
  }

  /** Whether Redis can be used right now; callers that must not lose state keep a fallback when it is not. */
  get ready(): boolean {
    return this.redis?.status === 'ready';
  }

  /** Atomically adds 1 to `key` and (re)starts its expiry; null when Redis is unavailable. */
  async increment(key: string, ttlSeconds: number): Promise<number | null> {
    if (!this.ready) return null;
    try {
      const res = await this.redis!.multi().incr(key).expire(key, ttlSeconds).exec();
      const count = res?.[0]?.[1];
      return typeof count === 'number' ? count : null;
    } catch {
      return null;
    }
  }

  /** Milliseconds until `key` expires: 0 when it does not exist, null when Redis is unavailable. */
  async remainingMs(key: string): Promise<number | null> {
    if (!this.ready) return null;
    try {
      const ms = await this.redis!.pttl(key);
      return ms > 0 ? ms : 0;
    } catch {
      return null;
    }
  }

  /** Sets `key` for `ttlMs` milliseconds; false when Redis is unavailable. */
  async setFor(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (!this.ready) return false;
    try {
      await this.redis!.set(key, value, 'PX', ttlMs);
      return true;
    } catch {
      return false;
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.ready || !keys.length) return;
    try {
      await this.redis!.del(...keys);
    } catch {
      /* fail open */
    }
  }

  /** Drop every key starting with `prefix` (e.g. after journals of a school change). */
  async invalidate(prefix: string): Promise<void> {
    if (this.redis?.status !== 'ready') return;
    try {
      const keys = await this.redis.keys(`${prefix}*`);
      if (keys.length) await this.redis.del(...keys);
    } catch {
      /* fail open */
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}

/**
 * Dashboards are cached; any successful write (school, account, class, student, camera, journal…) can change their
 * figures, so it drops the cached dashboards. Writes are rare next to dashboard reads, so this costs little.
 */
@Injectable()
export class DashboardCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: CacheService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = ctx.switchToHttp().getRequest<{ method: string }>().method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();
    return next
      .handle()
      .pipe(mergeMap(async (body: unknown) => (await this.cache.invalidate('dash:'), body)));
  }
}

@Global()
@Module({
  providers: [CacheService, { provide: APP_INTERCEPTOR, useClass: DashboardCacheInterceptor }],
  exports: [CacheService],
})
export class CacheModule {}
