import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ERROR_CODES } from '@loadless/shared';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  LOCKOUT_BASE_MS,
  LOCKOUT_MAX_MS,
  LOCKOUT_THRESHOLD,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import type { AccessTokenClaims } from './auth.types';
import { RevocationService } from './revocation.service';
import { TokenService } from './token.service';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    role: AccessTokenClaims['role'];
    vendorId?: string;
    driverId?: string;
  };
}

interface ClientContext {
  userAgent?: string;
  ip?: string;
}

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly revocation: RevocationService,
    private readonly events: EventEmitter2,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /** identifier: email (admins/vendors) or normalized phone (drivers) — pre-normalized by the DTO. */
  async login(identifier: string, password: string, ctx: ClientContext): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: identifier.includes('@') ? { email: identifier } : { normalizedPhone: identifier },
      include: { vendor: { select: { id: true, status: true } }, driver: { select: { id: true, status: true } } },
    });

    // Same error for unknown phone and wrong password — no account enumeration.
    if (!user) throw this.invalidCredentials();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException(
        ERROR_CODES.ACCOUNT_LOCKED,
        'Too many failed attempts — try again shortly',
        HttpStatus.LOCKED,
      );
    }

    const passwordOk = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordOk) {
      await this.recordFailedLogin(user.id, user.failedLogins);
      throw this.invalidCredentials();
    }

    if (!user.isActive || user.vendor?.status === 'SUSPENDED' || user.driver?.status === 'SUSPENDED') {
      throw new AppException(
        ERROR_CODES.ACCOUNT_DEACTIVATED,
        'This account has been deactivated',
        HttpStatus.FORBIDDEN,
      );
    }

    if (user.failedLogins > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null },
      });
    }

    return this.issueSession(
      { id: user.id, role: user.role, tokenVersion: user.tokenVersion, vendorId: user.vendor?.id, driverId: user.driver?.id },
      ctx,
    );
  }

  async refresh(presentedToken: string | undefined, ctx: ClientContext): Promise<AuthSession> {
    if (!presentedToken) throw this.invalidRefresh();
    const tokenHash = sha256(presentedToken);

    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            vendor: { select: { id: true, status: true } },
            driver: { select: { id: true, status: true } },
          },
        },
      },
    });
    if (!row) throw this.invalidRefresh();

    if (row.usedAt) {
      // Rotation reuse — treat as theft: kill the whole family.
      this.logger.warn(`Refresh token reuse detected for user ${row.userId}; revoking family`);
      await this.prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.events.emit('auth.token_reuse', { userId: row.userId });
      throw this.invalidRefresh();
    }
    if (row.revokedAt || row.expiresAt < new Date()) throw this.invalidRefresh();

    const user = row.user;
    if (!user.isActive || user.vendor?.status === 'SUSPENDED' || user.driver?.status === 'SUSPENDED') {
      throw new AppException(
        ERROR_CODES.ACCOUNT_DEACTIVATED,
        'This account has been deactivated',
        HttpStatus.FORBIDDEN,
      );
    }

    const newToken = randomBytes(48).toString('base64url');
    // Claim the presented token with the guard IN THE WHERE, the same rule the
    // order transitions follow. The read above is a read: two requests carrying
    // the same refresh token can both pass its `usedAt` check and both rotate,
    // and the pair that must never both succeed is exactly a thief and the
    // legitimate holder — the case reuse detection exists to catch, arriving
    // together. Whoever loses the conditional update is treated as reuse, which
    // kills the family rather than quietly issuing a second live token.
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        await tx.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw this.invalidRefresh();
      }
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(newToken),
          familyId: row.familyId,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
          userAgent: ctx.userAgent,
          ip: ctx.ip,
        },
      });
    });

    return {
      accessToken: this.signAccess(user.id, user.role, user.tokenVersion, user.vendor?.id, user.driver?.id),
      refreshToken: newToken,
      user: { id: user.id, role: user.role, vendorId: user.vendor?.id, driverId: user.driver?.id },
    };
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(presentedToken) },
      select: { familyId: true },
    });
    if (row) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  /**
   * Change your own password.
   *
   * The current password is required, and the same generic failure is used for
   * a wrong one as for a bad login: this route is reachable with a stolen
   * session, and it must not become a way to confirm a password.
   *
   * Changing a password ends every session — that is the point of changing it —
   * so this revokes them all and then issues a fresh one for the device that
   * asked. The person doing it stays signed in here; anyone holding a session
   * elsewhere, including whoever the change was prompted by, does not.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: ClientContext,
  ): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        vendor: { select: { id: true, status: true } },
        driver: { select: { id: true, status: true } },
      },
    });
    if (!user) throw this.invalidCredentials();

    const currentOk = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!currentOk) throw this.invalidCredentials();

    if (currentPassword === newPassword) {
      throw AppException.validation([
        { field: 'newPassword', message: 'The new password must be different from the current one' },
      ]);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(newPassword) },
    });

    // Bumps tokenVersion, so every access token minted before now is dead.
    await this.revokeAllSessions(userId, 'LOGGED_OUT');

    // Re-read: revokeAllSessions incremented the version this session must carry.
    const refreshed = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tokenVersion: true },
    });

    return this.issueSession(
      {
        id: user.id,
        role: user.role,
        tokenVersion: refreshed.tokenVersion,
        vendorId: user.vendor?.id,
        driverId: user.driver?.id,
      },
      ctx,
    );
  }

  /** Deactivation / password change: kill refresh chains + live access tokens + sockets. */
  async revokeAllSessions(userId: string, reason: 'DEACTIVATED' | 'LOGGED_OUT'): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.revocation.revokeBefore(userId, user.tokenVersion);
    this.events.emit('auth.sessions_revoked', { userId, reason });
  }

  private async issueSession(
    user: { id: string; role: AccessTokenClaims['role']; tokenVersion: number; vendorId?: string; driverId?: string },
    ctx: ClientContext,
  ): Promise<AuthSession> {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId: randomBytes(16).toString('hex'),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });
    return {
      accessToken: this.signAccess(user.id, user.role, user.tokenVersion, user.vendorId, user.driverId),
      refreshToken,
      user: { id: user.id, role: user.role, vendorId: user.vendorId, driverId: user.driverId },
    };
  }

  private signAccess(
    sub: string,
    role: AccessTokenClaims['role'],
    tv: number,
    vid?: string,
    did?: string,
  ): string {
    const claims: AccessTokenClaims = { sub, role, tv };
    if (vid) claims.vid = vid;
    if (did) claims.did = did;
    return this.tokens.signAccessToken(claims);
  }

  private async recordFailedLogin(userId: string, previousFailures: number): Promise<void> {
    const failures = previousFailures + 1;
    const overThreshold = failures - LOCKOUT_THRESHOLD;
    const lockedUntil =
      overThreshold >= 0
        ? new Date(Date.now() + Math.min(LOCKOUT_BASE_MS * 2 ** overThreshold, LOCKOUT_MAX_MS))
        : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLogins: failures, lockedUntil },
    });
  }

  private invalidCredentials(): AppException {
    return new AppException(
      ERROR_CODES.INVALID_CREDENTIALS,
      'Incorrect phone number or password',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private invalidRefresh(): AppException {
    return new AppException(
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      'Session expired — please sign in again',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
