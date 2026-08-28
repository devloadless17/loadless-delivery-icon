import { Injectable } from '@nestjs/common';
import type {
  CreateCustomerInput,
  CustomerAddressInput,
  OffsetPagination,
  UpdateCustomerInput,
} from '@loadless/shared';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { offsetArgs, offsetMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

type Tx = Prisma.TransactionClient;

const CUSTOMER_SELECT = {
  id: true,
  normalizedPhone: true,
  name: true,
  createdByVendorId: true,
  createdAt: true,
  addresses: {
    where: { isArchived: false },
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, label: true, addressText: true, lat: true, lng: true },
  },
} as const;

/**
 * Customers are GLOBAL: shared across all vendors, keyed by normalized phone.
 * Policy (documented in the plan): any active vendor may read, create, edit
 * names and add addresses; every edit leaves a change-history diff; the phone
 * (identity key) is admin-only to change. `createdByVendorId` is immutable
 * attribution, never ownership.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhone(normalizedPhone: string) {
    return this.prisma.customer.findUnique({
      where: { normalizedPhone },
      select: CUSTOMER_SELECT,
    });
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: CUSTOMER_SELECT,
    });
    if (!customer) throw AppException.notFound('Customer not found');
    return customer;
  }

  /**
   * Upsert-by-phone: the shared-customer model means "creating" an existing
   * phone reuses the global record (optionally appending the given address).
   */
  async createOrReuse(input: CreateCustomerInput, actor: AuthUser) {
    const existing = await this.findByPhone(input.phone);
    if (existing) {
      if (input.address) {
        await this.addAddress(existing.id, input.address, actor);
        return { customer: await this.get(existing.id), created: false };
      }
      return { customer: existing, created: false };
    }

    const customer = await this.prisma.customer.create({
      data: {
        normalizedPhone: input.phone,
        name: input.name,
        createdByVendorId: actor.vendorId ?? null,
        addresses: input.address
          ? {
              create: {
                label: input.address.label,
                addressText: input.address.addressText,
                lat: input.address.lat,
                lng: input.address.lng,
                createdByVendorId: actor.vendorId ?? null,
              },
            }
          : undefined,
      },
      select: CUSTOMER_SELECT,
    });
    return { customer, created: true };
  }

  /** Used inside the order-creation transaction. */
  async upsertInTx(
    tx: Tx,
    phone: string,
    name: string | undefined,
    actor: AuthUser,
  ): Promise<{ id: string; name: string }> {
    const existing = await tx.customer.findUnique({
      where: { normalizedPhone: phone },
      select: { id: true, name: true },
    });
    if (existing) return existing;
    if (!name) {
      throw AppException.validation([
        { field: 'customerName', message: 'Name is required for a new customer' },
      ]);
    }
    return tx.customer.create({
      data: { normalizedPhone: phone, name, createdByVendorId: actor.vendorId ?? null },
      select: { id: true, name: true },
    });
  }

  async update(id: string, input: UpdateCustomerInput, actor: AuthUser) {
    const existing = await this.get(id);
    if (input.name === undefined || input.name === existing.name) return existing;

    const [updated] = await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id },
        data: { name: input.name },
        select: CUSTOMER_SELECT,
      }),
      this.prisma.customerChangeHistory.create({
        data: {
          customerId: id,
          changedByUserId: actor.userId,
          actorType: actor.role,
          changes: { name: { old: existing.name, new: input.name } },
        },
      }),
    ]);
    return updated;
  }

  async addAddress(customerId: string, input: CustomerAddressInput, actor: AuthUser) {
    await this.get(customerId); // 404 guard
    const [address] = await this.prisma.$transaction([
      this.prisma.customerAddress.create({
        data: {
          customerId,
          label: input.label,
          addressText: input.addressText,
          lat: input.lat,
          lng: input.lng,
          createdByVendorId: actor.vendorId ?? null,
        },
        select: { id: true, label: true, addressText: true, lat: true, lng: true },
      }),
      this.prisma.customerChangeHistory.create({
        data: {
          customerId,
          changedByUserId: actor.userId,
          actorType: actor.role,
          changes: { addressAdded: { new: input.addressText } },
        },
      }),
    ]);
    return address;
  }

  async archiveAddress(customerId: string, addressId: string, actor: AuthUser) {
    const result = await this.prisma.customerAddress.updateMany({
      where: { id: addressId, customerId, isArchived: false },
      data: { isArchived: true },
    });
    if (result.count === 0) throw AppException.notFound('Address not found');
    await this.prisma.customerChangeHistory.create({
      data: {
        customerId,
        changedByUserId: actor.userId,
        actorType: actor.role,
        changes: { addressArchived: { old: addressId } },
      },
    });
  }

  /** Admin browsing — vendors never get bulk listing (search is exact-phone only). */
  async adminList(pagination: OffsetPagination, q?: string) {
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { normalizedPhone: { contains: q.replace(/\s/g, '') } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: {
          id: true,
          normalizedPhone: true,
          name: true,
          createdAt: true,
          createdByVendor: { select: { businessName: true } },
          _count: { select: { orders: true, addresses: { where: { isArchived: false } } } },
        },
        orderBy: { createdAt: 'desc' },
        ...offsetArgs(pagination),
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data: rows, meta: offsetMeta(pagination, total) as unknown as Record<string, unknown> };
  }
}
