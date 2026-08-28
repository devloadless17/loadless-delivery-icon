import { Injectable } from '@nestjs/common';
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
    const [rows, total] = await this.prisma.$transaction([
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
