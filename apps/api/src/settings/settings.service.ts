import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const SETTINGS_ID = 'singleton';
const CACHE_KEY = 'cache:platform-settings';
const CACHE_TTL_SECONDS = 300; // safe: explicitly invalidated on every update

export interface PlatformSettings {
  defaultCommissionBps: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(): Promise<PlatformSettings> {
    const cached = await this.redis.getJson<PlatformSettings>(CACHE_KEY);
    if (cached) return cached;
    const row = await this.prisma.platformSetting.findUniqueOrThrow({
      where: { id: SETTINGS_ID },
      select: { defaultCommissionBps: true },
    });
    await this.redis.setJson(CACHE_KEY, row, CACHE_TTL_SECONDS);
    return row;
  }

  async update(data: PlatformSettings): Promise<PlatformSettings> {
    const row = await this.prisma.platformSetting.update({
      where: { id: SETTINGS_ID },
      data,
      select: { defaultCommissionBps: true },
    });
    await this.redis.del(CACHE_KEY);
    return row;
  }

  /**
   * Commission resolution — reads THROUGH the transaction for the driver row
   * but the platform default may come from cache: a mid-flight settings change
   * only affects orders accepted after the cache invalidation, which is the
   * documented snapshot semantic.
   */
  async defaultCommissionBps(): Promise<number> {
    return (await this.get()).defaultCommissionBps;
  }
}
