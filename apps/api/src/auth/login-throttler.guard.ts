import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHash } from 'node:crypto';

/**
 * Rate-limits sign-in attempts per ACCOUNT-on-an-address, not per address.
 *
 * The default tracker is the IP alone, which is the wrong unit here. Lebanese
 * mobile carriers run CGNAT, so a driver on mobile data shares one public IPv4
 * with a large pool of other subscribers, and two staff in the same shop share
 * their WiFi. With a per-IP budget of five a minute, one person fat-fingering a
 * password spends everyone else's allowance and honest users are told "too many
 * attempts" for something they did not do — a self-inflicted outage with no
 * signal that anything is wrong.
 *
 * Keying on the identifier as well means an attacker pounding one account is
 * still limited exactly as before, while the vendor next door is unaffected.
 * Two things still cover what this no longer does:
 *
 *   - the per-ACCOUNT lockout (5 failures, then 1 min doubling to 15) is the
 *     real brute-force control, and it does not care which IP the attempts
 *     come from;
 *   - the global 100/min per-IP throttle still caps someone spraying many
 *     identifiers from one host.
 *
 * The identifier is hashed into the key: throttler keys live in Redis, and a
 * bare email or phone number in a cache key is a needless copy of user data.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const ip = req.ip ?? 'unknown';
    const body = req.body as { identifier?: unknown } | undefined;
    const identifier = typeof body?.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
    if (!identifier) return ip;
    const who = createHash('sha256').update(identifier).digest('base64url').slice(0, 24);
    return `${ip}:${who}`;
  }
}
