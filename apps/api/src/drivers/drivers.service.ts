import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ERROR_CODES, phoneSearchPrefix } from '@loadless/shared';
import type { CreateDriverInput, OffsetPagination, UpdateDriverInput } from '@loadless/shared';
import { AppException } from '../common/app.exception';
import { offsetArgs, offsetMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import type { AuthUser } from '../auth/auth.types';

const DRIVER_LIST_SELECT = {
  id: true,
  fullName: true,
  contactPhone: true,
  facePhotoKey: true,
  bikePhotoKey: true,
  status: true,
  dutyStatus: true,
  commissionOverrideBps: true,
  createdAt: true,
  user: { select: { normalizedPhone: true } },
} as const;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly files: FilesService,
  ) {}

  async create(input: CreateDriverInput, actor: AuthUser) {
    const driver = await this.prisma.$transaction(async (tx) => {
      const user = await this.users.createUser(tx, { normalizedPhone: input.phone }, input.password, 'DRIVER');
      return tx.driver.create({
        data: {
          userId: user.id,
          fullName: input.fullName,
          contactPhone: input.contactPhone ?? input.phone,
          commissionOverrideBps: input.commissionOverrideBps ?? null,
        },
        select: DRIVER_LIST_SELECT,
      });
    });
    this.audit.log({
      actor,
      action: 'DRIVER_CREATED',
      entityType: 'Driver',
      entityId: driver.id,
      metadata: { fullName: driver.fullName, commissionOverrideBps: driver.commissionOverrideBps },
    });
    return driver;
  }

  async list(
    pagination: OffsetPagination,
    filters: { q?: string; dutyStatus?: 'ON_DUTY' | 'OFF_DUTY' },
  ) {
    const where = {
      ...(filters.dutyStatus ? { dutyStatus: filters.dutyStatus } : {}),
      ...(filters.q
        ? {
            OR: [
              { fullName: { contains: filters.q, mode: 'insensitive' as const } },
              // The STORED prefix, country code included — the same rule the
              // customer search uses. Stripping whitespace by hand looked
              // equivalent and was not: both phone columns hold E.164, so a
              // typed "03 123 456" became "03123456", which appears nowhere in
              // "+9613123456". Searching a driver by the number the UI itself
              // DISPLAYS returned nothing at all, silently.
              ...(phoneSearchPrefix(filters.q)
                ? [
                    { contactPhone: { startsWith: phoneSearchPrefix(filters.q) } },
                    { user: { normalizedPhone: { startsWith: phoneSearchPrefix(filters.q) } } },
                  ]
                : []),
            ],
          }
        : {}),
    };
    // Promise.all, not $transaction([a, b]): $transaction runs them in SERIES
    // on one connection, and a page and its total are never compared to each
    // other on screen, so they gain nothing from sharing a snapshot and pay
    // for it in latency.
    const [rows, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        select: DRIVER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        ...offsetArgs(pagination),
      }),
      this.prisma.driver.count({ where }),
    ]);
    return { data: rows, meta: offsetMeta(pagination, total) as unknown as Record<string, unknown> };
  }

  async get(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      select: { ...DRIVER_LIST_SELECT, userId: true, updatedAt: true },
    });
    if (!driver) throw AppException.notFound('Driver not found');
    return driver;
  }

  async update(id: string, input: UpdateDriverInput, actor: AuthUser) {
    const existing = await this.get(id);
    const commissionChanged =
      input.commissionOverrideBps !== undefined &&
      input.commissionOverrideBps !== existing.commissionOverrideBps;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.password) await this.users.setPassword(tx, existing.userId, input.password);
      return tx.driver.update({
        where: { id },
        data: {
          fullName: input.fullName,
          contactPhone: input.contactPhone,
          status: input.status,
          commissionOverrideBps:
            input.commissionOverrideBps === undefined ? undefined : input.commissionOverrideBps,
          facePhotoKey: input.facePhotoKey === undefined ? undefined : input.facePhotoKey,
          bikePhotoKey: input.bikePhotoKey === undefined ? undefined : input.bikePhotoKey,
        },
        select: DRIVER_LIST_SELECT,
      });
    });

    if (input.status === 'SUSPENDED' || input.password) {
      await this.auth.revokeAllSessions(existing.userId, 'DEACTIVATED');
    }

    this.audit.log({
      actor,
      action: commissionChanged ? 'DRIVER_COMMISSION_UPDATED' : 'DRIVER_UPDATED',
      entityType: 'Driver',
      entityId: id,
      metadata: {
        changed: Object.keys(input).filter((k) => k !== 'password'),
        passwordReset: !!input.password,
        ...(commissionChanged
          ? {
              commissionBefore: existing.commissionOverrideBps,
              commissionAfter: input.commissionOverrideBps,
            }
          : {}),
      },
    });
    return updated;
  }

  async setDuty(driverId: string, dutyStatus: 'ON_DUTY' | 'OFF_DUTY') {
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: { dutyStatus },
      select: { id: true, dutyStatus: true, status: true },
    });
    this.events.emit('driver.duty_changed', {
      driverId: driver.id,
      dutyStatus: driver.dutyStatus,
      at: new Date(),
    });
    return driver;
  }

  /**
   * Delete a driver outright — allowed only while they have never carried an
   * order.
   *
   * Note the driver FK differs from the other two. `orders.vendor_id` and
   * `orders.customer_id` are ON DELETE RESTRICT; `orders.driver_id` is ON DELETE
   * **SET NULL**. What stops a delete from blanking a driver off a delivery is
   * therefore not the FK but the `order_status_driver_coupling` CHECK, which
   * requires a driver on anything DRIVER_ASSIGNED / PICKED_UP / DELIVERED /
   * FAILED — so Postgres refuses the whole delete with a constraint violation.
   *
   * Two reasons this check still earns its place. It turns that violation into a
   * 409 that names the remedy instead of an opaque 500. And it covers the gap
   * the CHECK deliberately leaves: a CANCELLED order "may or may not carry a
   * driver", so there SET NULL IS permitted and a delete would quietly detach
   * the driver who had been assigned.
   *
   * SUSPENDED stops a driver working and ends their sessions with the record
   * intact, which is the right operation for anyone who has ridden.
   *
   * Their ID and bike photos go with them — those exist to identify a working
   * driver, and keeping them after the account is gone serves no one.
   */
  async remove(id: string, actor: AuthUser) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      select: { id: true, userId: true, fullName: true, facePhotoKey: true, bikePhotoKey: true },
    });
    if (!driver) throw AppException.notFound('Driver not found');

    const orderCount = await this.prisma.order.count({ where: { driverId: id } });
    if (orderCount > 0) {
      throw AppException.conflict(
        ERROR_CODES.DRIVER_HAS_ORDERS,
        `${driver.fullName} has carried ${orderCount} order${orderCount === 1 ? '' : 's'}, ` +
          `which record what they were paid. Deleting the driver would leave those earnings ` +
          `attached to nobody. Suspend them instead — that ends their sessions and takes them ` +
          `off duty, while the record survives.`,
      );
    }

    // Settlements are the record of cash that physically changed hands, and
    // driver_settlements.driver_id is ON DELETE RESTRICT — so refuse clearly
    // here rather than letting the FK surface as an opaque 500.
    const settlementCount = await this.prisma.driverSettlement.count({ where: { driverId: id } });
    if (settlementCount > 0) {
      throw AppException.conflict(
        ERROR_CODES.DRIVER_HAS_SETTLEMENTS,
        `${driver.fullName} has ${settlementCount} recorded settlement${settlementCount === 1 ? '' : 's'}, ` +
          `which are the record of cash they actually handed over. Suspend them instead — ` +
          `that ends their sessions and takes them off duty, while the record survives.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Driver before user: drivers.user_id is ON DELETE RESTRICT.
      await tx.driverBalance.deleteMany({ where: { driverId: id } });
      await tx.driver.delete({ where: { id } });
      await tx.user.delete({ where: { id: driver.userId } });
    });

    for (const key of [driver.facePhotoKey, driver.bikePhotoKey]) {
      if (key) await this.files.removeByKey(key);
    }

    this.audit.log({
      actor,
      action: 'DRIVER_DELETED',
      entityType: 'Driver',
      entityId: id,
      metadata: { fullName: driver.fullName },
    });
    return { id };
  }

  async selfGet(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: DRIVER_LIST_SELECT,
    });
    if (!driver) throw AppException.notFound('Driver not found');
    return driver;
  }
}
