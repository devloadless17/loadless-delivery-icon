import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';

const KEY_PREFIX = 'auth:revoked-tv:';

/**
 * Closes the access-token window after deactivation / password change /
 * forced logout: the guard rejects tokens whose tokenVersion predates the
 * recorded minimum. Backed by Redis (multi-instance ready) with a small
 * in-process cache so hot requests cost nothing.
 */
@Injectable()
export class RevocationService {
  private readonly local = new Map<string, { minTv: number; expiresAt: number }>();

  constructor(private readonly redis: RedisService) {}

  async revokeBefore(userId: string, minTokenVersion: number): Promise<void> {
    this.local.set(userId, {
      minTv: minTokenVersion,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    await this.redis.setJson(KEY_PREFIX + userId, minTokenVersion, ACCESS_TOKEN_TTL_SECONDS);
  }

  /** true when the presented token (with tv claim) has been revoked. */
  async isRevoked(userId: string, tokenVersion: number): Promise<boolean> {
    const cached = this.local.get(userId);
    if (cached) {
      if (cached.expiresAt < Date.now()) this.local.delete(userId);
      else return tokenVersion < cached.minTv;
    }
    const stored = await this.redis.getJson<number>(KEY_PREFIX + userId);
    if (stored === null) return false;
    this.local.set(userId, {
      minTv: stored,
      expiresAt: Date.now() + 30_000,
    });
    return tokenVersion < stored;
  }
}
