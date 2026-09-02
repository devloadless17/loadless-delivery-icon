import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@loadless/shared';
import type {
  CreateVendorInput,
  OffsetPagination,
  UpdateVendorInput,
  VendorSelfUpdateInput,
} from '@loadless/shared';
import { AppException } from '../common/app.exception';
import { offsetArgs, offsetMeta, type OffsetMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import type { AuthUser } from '../auth/auth.types';

const VENDOR_LIST_SELECT = {
  id: true,
  businessName: true,
  logoKey: true,
  status: true,
  createdAt: true,
  user: { select: { email: true } },
} as const;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  async create(input: CreateVendorInput, actor: AuthUser) {
    const vendor = await this.prisma.$transaction(async (tx) => {
      const user = await this.users.createUser(tx, { email: input.email }, input.password, 'VENDOR');
      return tx.vendor.create({
        data: { userId: user.id, businessName: input.businessName },
        select: VENDOR_LIST_SELECT,
      });
    });
    this.audit.log({
      actor,
      action: 'VENDOR_CREATED',
      entityType: 'Vendor',
      entityId: vendor.id,
      metadata: { businessName: vendor.businessName },
    });
    return vendor;
  }

  async list(pagination: OffsetPagination, search?: string) {
    const where = search
      ? {
          OR: [
            { businessName: { contains: search, mode: 'insensitive' as const } },
            { user: { email: { contains: search.toLowerCase() } } },
          ],
        }
      : {};
    // Promise.all, not $transaction([a, b]): $transaction runs them in SERIES
    // on one connection, and a page and its total are never compared to each
    // other on screen, so they gain nothing from sharing a snapshot and pay
    // for it in latency.
    const [rows, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        select: VENDOR_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        ...offsetArgs(pagination),
      }),
      this.prisma.vendor.count({ where }),
    ]);
    return { data: rows, meta: offsetMeta(pagination, total) as OffsetMeta & Record<string, unknown> };
  }

  async get(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: { ...VENDOR_LIST_SELECT, userId: true, updatedAt: true },
    });
    if (!vendor) throw AppException.notFound('Vendor not found');
    return vendor;
  }

  async update(id: string, input: UpdateVendorInput, actor: AuthUser) {
    const existing = await this.get(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.password) await this.users.setPassword(tx, existing.userId, input.password);
      return tx.vendor.update({
        where: { id },
        data: {
          businessName: input.businessName,
          status: input.status,
          logoKey: input.logoKey === undefined ? undefined : input.logoKey,
        },
        select: VENDOR_LIST_SELECT,
      });
    });

    // Suspension or password reset must kill live sessions immediately.
    if (input.status === 'SUSPENDED' || input.password) {
      await this.auth.revokeAllSessions(existing.userId, 'DEACTIVATED');
    }

    this.audit.log({
      actor,
      action: 'VENDOR_UPDATED',
      entityType: 'Vendor',
      entityId: id,
      metadata: {
        changed: Object.keys(input).filter((k) => k !== 'password'),
        passwordReset: !!input.password,
        status: input.status,
      },
    });
    return updated;
  }

  /**
   * Delete a vendor outright — allowed only while they have never taken an
   * order.
   *
   * The restriction is an accounting one, not a permissions one. Every order
   * carries the commission snapshot taken at driver acceptance and the earnings
   * derived from it, plus its own status history: the record of money the
   * platform charged and money a driver is owed. Deleting a vendor who has
   * traded would erase the counterparty of real deliveries (and the order FK
   * refuses it anyway). SUSPENDED stops a vendor trading and ends their
   * sessions while that record survives, which is the right operation there.
   *
   * With no orders there is nothing to preserve — a vendor typed in wrongly is
   * just noise — so this removes them and their login completely.
   *
   * What goes: the vendor, their user (so the account cannot sign in), their
   * sessions (FK cascade) and their customer-relationship rows (FK cascade),
   * plus the logo file. What STAYS: customers and addresses they added. Those
   * belong to the platform, not to the vendor who happened to type them in
   * (CLAUDE.md) — they simply lose their "added by" attribution via SetNull.
   */
  async remove(id: string, actor: AuthUser) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: { id: true, userId: true, businessName: true, logoKey: true },
    });
    if (!vendor) throw AppException.notFound('Vendor not found');

    const orderCount = await this.prisma.order.count({ where: { vendorId: id } });
    if (orderCount > 0) {
      throw AppException.conflict(
        ERROR_CODES.VENDOR_HAS_ORDERS,
        `${vendor.businessName} has ${orderCount} order${orderCount === 1 ? '' : 's'} on record, ` +
          `which carry the commission and driver earnings for deliveries that actually happened. ` +
          `Suspend the vendor instead — that stops them trading and ends their sessions, ` +
          `while the money record survives.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Vendor before user: vendor.userId has no cascade, so the user cannot go
      // first — the FK would refuse it.
      await tx.vendor.delete({ where: { id } });
      await tx.user.delete({ where: { id: vendor.userId } });
    });

    // After commit, and never allowed to fail the delete: the vendor is already
    // gone, so a stranded blob is the lesser problem.
    if (vendor.logoKey) await this.files.removeByKey(vendor.logoKey);

    this.audit.log({
      actor,
      action: 'VENDOR_DELETED',
      entityType: 'Vendor',
      entityId: id,
      metadata: { businessName: vendor.businessName },
    });
    return { id };
  }

  async selfGet(vendorId: string) {
    return this.get(vendorId);
  }

  async selfUpdate(vendorId: string, input: VendorSelfUpdateInput) {
    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: { logoKey: input.logoKey === undefined ? undefined : input.logoKey },
      select: VENDOR_LIST_SELECT,
    });
  }
}
