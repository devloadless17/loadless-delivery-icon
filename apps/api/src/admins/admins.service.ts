import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@loadless/shared';
import type { CreateAdminInput, OffsetPagination, UpdateAdminInput } from '@loadless/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { offsetArgs, offsetMeta, type OffsetMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';

/**
 * An admin is a `users` row and nothing else — no profile table, no name. So
 * this select IS the admin, and `isActive` is what "suspended" means for one.
 */
const ADMIN_SELECT = {
  id: true,
  email: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * How many admins could still sign in, counted with the admin rows LOCKED.
   *
   * The lock is the point. Two admins deleting each other at the same moment
   * would otherwise each read "2 remain" from their own snapshot, both pass the
   * guard, and both commit — leaving nobody who can sign in. FOR UPDATE makes
   * the second transaction wait and then see the truth.
   *
   * `excludingUserId` is the row about to be removed or deactivated, so the
   * caller asks "how many would be left" rather than doing the arithmetic.
   */
  private async countOtherActiveAdmins(
    tx: Prisma.TransactionClient,
    excludingUserId: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "users"
      WHERE "role" = 'ADMIN' AND "is_active" = true AND "id" <> ${excludingUserId}
      FOR UPDATE
    `;
    return rows.length;
  }

  /** Refuses an admin acting on their own account. */
  private refuseSelf(targetUserId: string, actor: AuthUser, verb: string): void {
    if (targetUserId !== actor.userId) return;
    throw AppException.conflict(
      ERROR_CODES.ADMIN_SELF_ACTION,
      `You cannot ${verb} your own admin account. Ask another admin to do it — ` +
        `and to change your own password, use the password form in Settings.`,
    );
  }

  private async requireAdmin(id: string) {
    const admin = await this.prisma.user.findFirst({
      where: { id, role: 'ADMIN' },
      select: ADMIN_SELECT,
    });
    if (!admin) throw AppException.notFound('Admin not found');
    return admin;
  }

  async create(input: CreateAdminInput, actor: AuthUser) {
    // createUser maps a duplicate to a CONFLICT for us; nothing else to guard.
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await this.users.createUser(tx, { email: input.email }, input.password, 'ADMIN');
      return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: ADMIN_SELECT });
    });

    this.audit.log({
      actor,
      action: 'ADMIN_CREATED',
      entityType: 'User',
      entityId: created.id,
      metadata: { email: created.email },
    });
    return created;
  }

  async list(pagination: OffsetPagination, search?: string) {
    const where: Prisma.UserWhereInput = {
      role: 'ADMIN',
      ...(search ? { email: { contains: search.toLowerCase() } } : {}),
    };
    // Promise.all, not $transaction([a, b]): a page and its total are never
    // compared to each other on screen, so they gain nothing from one snapshot
    // and pay for it in latency.
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ADMIN_SELECT,
        orderBy: { createdAt: 'desc' },
        ...offsetArgs(pagination),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: rows, meta: offsetMeta(pagination, total) as OffsetMeta & Record<string, unknown> };
  }

  async get(id: string) {
    return this.requireAdmin(id);
  }

  /**
   * Reset another admin's password, and/or suspend or reactivate them.
   *
   * A password here is always a RESET by somebody else — an admin changing
   * their OWN password goes through POST /auth/change-password, which asks for
   * the current one. That is why this endpoint refuses to touch your own row
   * for status but does not need to verify anything: the guard is that it is
   * never you.
   */
  async update(id: string, input: UpdateAdminInput, actor: AuthUser) {
    const existing = await this.requireAdmin(id);
    const suspending = input.status === 'SUSPENDED';

    if (input.status !== undefined) this.refuseSelf(id, actor, 'suspend or reactivate');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (suspending && (await this.countOtherActiveAdmins(tx, id)) === 0) {
        throw AppException.conflict(
          ERROR_CODES.LAST_ADMIN,
          `${existing.email} is the only admin who can still sign in. Suspending them would ` +
            `lock everybody out of the console. Add another admin first.`,
        );
      }
      if (input.password) await this.users.setPassword(tx, id, input.password);
      return tx.user.update({
        where: { id },
        data: { ...(input.status ? { isActive: input.status === 'ACTIVE' } : {}) },
        select: ADMIN_SELECT,
      });
    });

    // After commit, exactly as vendors and drivers do it: a suspension or a
    // password reset has to end their live sessions immediately, not whenever
    // the 15-minute access token happens to expire.
    if (suspending || input.password) {
      await this.auth.revokeAllSessions(id, 'DEACTIVATED');
    }

    this.audit.log({
      actor,
      action: 'ADMIN_UPDATED',
      entityType: 'User',
      entityId: id,
      metadata: {
        email: existing.email,
        changed: Object.keys(input).filter((k) => k !== 'password'),
        passwordReset: !!input.password,
        status: input.status,
      },
    });
    return updated;
  }

  /**
   * Delete another admin outright.
   *
   * Unlike a vendor or a driver there is no accounting reason to keep the row:
   * an admin owns no orders and no money. `audit_logs.actor_user_id` has no
   * foreign key, so everything they ever did survives them — which is the whole
   * reason deleting is allowed at all.
   */
  async remove(id: string, actor: AuthUser) {
    const existing = await this.requireAdmin(id);
    this.refuseSelf(id, actor, 'delete');

    // BEFORE the delete: revokeAllSessions needs the row to bump its
    // tokenVersion, and that bump is what makes the access token this admin is
    // holding right now stop working. Delete first and they would keep the
    // console for up to the token's remaining lifetime.
    await this.auth.revokeAllSessions(id, 'DEACTIVATED');

    await this.prisma.$transaction(async (tx) => {
      if ((await this.countOtherActiveAdmins(tx, id)) === 0) {
        throw AppException.conflict(
          ERROR_CODES.LAST_ADMIN,
          `${existing.email} is the only admin who can still sign in. Deleting them would ` +
            `lock everybody out of the console, and the only way back is re-running the ` +
            `bootstrap script. Add another admin first.`,
        );
      }
      await tx.user.delete({ where: { id } }); // refresh_tokens cascade
    });

    this.audit.log({
      actor,
      action: 'ADMIN_DELETED',
      entityType: 'User',
      entityId: id,
      metadata: { email: existing.email },
    });
    return { id };
  }
}
