import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/config.service';

/**
 * Shared Redis connection. Caching policy is a narrow allowlist (see plan):
 * analytics aggregates, platform settings, throttler + deactivation state.
 * Order data is NEVER cached.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
    });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  /** Cache-aside helper: JSON get/set with TTL. Returns null on any Redis failure. */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null; // cache failures must never break requests
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // ignore — cache is best-effort
    }
  }

  async del(...keys: string[]): Promise<void> {
    try {
      if (keys.length > 0) await this.client.del(...keys);
    } catch {
      // ignore
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
