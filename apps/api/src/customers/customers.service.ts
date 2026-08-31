import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateCustomerInput,
  CustomerAddressInput,
  OffsetPagination,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from '@loadless/shared';
import { ERROR_CODES, normalizeAddressKey } from '@loadless/shared';
import { Prisma, type AddressLabel } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { offsetArgs, offsetMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ADDRESS_SELECT, CUSTOMER_SELECT } from './customer.select';

type Tx = Prisma.TransactionClient;


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
      }
      return { customerId: existing.id, created: false };
    }

    const customerId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          normalizedPhone: input.phone,
          name: input.name,
          createdByVendorId: actor.vendorId ?? null,
        },
        select: { id: true },
      });
      // Birth event, so the change history starts at the beginning of the story.
      await tx.customerChangeHistory.create({
        data: {
          customerId: created.id,
          changedByUserId: actor.userId,
          actorType: actor.role,
          changes: { created: { new: { name: input.name, phone: input.phone } } } as never,
        },
      });
      if (input.address) {
        await this.saveAddressInTx(tx, created.id, input.address, actor);
      }
      return created.id;
    });
    return { customerId, created: true };
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

  /**
   * Save a delivery location to the address book, idempotently.
   *
   * Match order: same maps link (definitive), else same normalized address
   * text. On a match we never overwrite the stored text — the older spelling is
   * usually the better one — but we DO backfill a missing maps link, which is a
   * strict improvement for the driver.
   *
   * The partial unique index customer_address_dedupe_uniq is the backstop for
   * the case this cannot see: two concurrent orders for the same place.
   */
  async saveAddressInTx(
    tx: Tx,
    customerId: string,
    input: {
      addressText?: string | null;
      mapsUrl?: string | null;
      lat?: number | null;
      lng?: number | null;
      label?: AddressLabel;
    },
    actor: AuthUser,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await tx.customerAddress.findMany({
      where: { customerId, isArchived: false }, // index [customerId, isArchived]
      select: { id: true, addressText: true, mapsUrl: true },
    });

    const key = normalizeAddressKey(input.addressText);
    const link = input.mapsUrl?.trim() || null;
    const match =
      (link ? existing.find((a) => a.mapsUrl?.trim() === link) : undefined) ??
      // A link-only address has no text key, so it can only match on the link.
      (key ? existing.find((a) => normalizeAddressKey(a.addressText) === key) : undefined);

    if (match) {
      if (link && !match.mapsUrl) {
        await tx.customerAddress.update({ where: { id: match.id }, data: { mapsUrl: link } });
        await tx.customerChangeHistory.create({
          data: {
            customerId,
            changedByUserId: actor.userId,
            actorType: actor.role,
            changes: {
              addressEnriched: { addressId: match.id, mapsUrl: { old: null, new: link } },
            } as never,
          },
        });
      }
      return { id: match.id, created: false };
    }

    // A customer's first saved address is almost always home; the rest default
    // to OTHER unless the caller says otherwise.
    const label: AddressLabel = input.label ?? (existing.length === 0 ? 'HOME' : 'OTHER');

    // ON CONFLICT DO NOTHING rather than catch-P2002: a unique violation
    // inside an interactive transaction ABORTS it, so the recovery read would
    // fail too. This way the loser of a race simply inserts nothing and then
    // reads the winner's row in a still-healthy transaction.
    const inserted = await tx.customerAddress.createMany({
      data: [
        {
          customerId,
          label,
          addressText: input.addressText?.trim() || null,
          mapsUrl: link,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          createdByVendorId: actor.vendorId ?? null,
        },
      ],
      skipDuplicates: true,
    });

    if (inserted.count === 0) {
      // A concurrent write got there first — which is exactly what we wanted.
      const rows = await tx.customerAddress.findMany({
        where: { customerId, isArchived: false },
        select: { id: true, addressText: true, mapsUrl: true },
      });
      const winner =
        (link ? rows.find((a) => a.mapsUrl?.trim() === link) : undefined) ??
        (key ? rows.find((a) => normalizeAddressKey(a.addressText) === key) : undefined);
      if (!winner) throw AppException.notFound('Address not found');
      return { id: winner.id, created: false };
    }

    const created = await tx.customerAddress.findFirstOrThrow({
      where: {
        customerId,
        isArchived: false,
        ...(input.addressText?.trim()
          ? { addressText: input.addressText.trim() }
          : { mapsUrl: link }),
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    await tx.customerChangeHistory.create({
      data: {
        customerId,
        changedByUserId: actor.userId,
        actorType: actor.role,
        changes: { addressAdded: { addressId: created.id, new: input.addressText } } as never,
      },
    });
    return { id: created.id, created: true };
  }

  /** Explicit "add address" — same dedupe rule as the order path. */
  async addAddress(customerId: string, input: CustomerAddressInput, actor: AuthUser) {
    await this.get(customerId); // 404 guard
    const { id } = await this.prisma.$transaction((tx) =>
      this.saveAddressInTx(tx, customerId, input, actor),
    );
    return this.prisma.customerAddress.findUniqueOrThrow({
      where: { id },
      select: ADDRESS_SELECT,
    });
  }

  /** Correct a saved address in place — the gap that forced archive-and-re-add. */
  async updateAddress(
    customerId: string,
    addressId: string,
    input: UpdateCustomerAddressInput,
    actor: AuthUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Scoping in the WHERE: an address on another customer, or an archived
      // one, is NOT FOUND — never "forbidden", so nothing leaks existence.
      const existing = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId, isArchived: false },
        select: ADDRESS_SELECT,
      });
      if (!existing) throw AppException.notFound('Address not found');

      const diff: Record<string, { old: unknown; new: unknown }> = {};
      for (const key of ['label', 'addressText', 'mapsUrl'] as const) {
        const next = input[key];
        if (next !== undefined && next !== existing[key]) {
          diff[key] = { old: existing[key], new: next };
        }
      }
      if (Object.keys(diff).length === 0) return existing; // no-op writes no history

      try {
        const updated = await tx.customerAddress.update({
          where: { id: addressId },
          data: {
            ...(diff.label ? { label: input.label } : {}),
            ...(diff.addressText ? { addressText: input.addressText?.trim() || null } : {}),
            ...(diff.mapsUrl ? { mapsUrl: input.mapsUrl?.trim() || null } : {}),
          },
          select: ADDRESS_SELECT,
        });
        await tx.customerChangeHistory.create({
          data: {
            customerId,
            changedByUserId: actor.userId,
            actorType: actor.role,
            changes: { addressUpdated: { addressId, ...diff } } as never,
          },
        });
        return updated;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') throw AppException.notFound('Address not found');
          if (err.code === 'P2002') {
            throw AppException.conflict(
              ERROR_CODES.CONFLICT,
              'This address is already saved for this customer',
            );
          }
        }
        throw err;
      }
    });
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

  /** Admin-only: correct name and/or the identity phone (uniqueness-safe). */
  async adminUpdate(
    id: string,
    input: { name?: string; phone?: string },
    actor: AuthUser,
  ) {
    const existing = await this.get(id);
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (input.name && input.name !== existing.name) {
      changes.name = { old: existing.name, new: input.name };
    }
    if (input.phone && input.phone !== existing.normalizedPhone) {
      changes.normalizedPhone = { old: existing.normalizedPhone, new: input.phone };
    }
    if (Object.keys(changes).length === 0) return existing;

    try {
      const [updated] = await this.prisma.$transaction([
        this.prisma.customer.update({
          where: { id },
          data: {
            ...(changes.name ? { name: input.name } : {}),
            ...(changes.normalizedPhone ? { normalizedPhone: input.phone } : {}),
          },
          select: CUSTOMER_SELECT,
        }),
        this.prisma.customerChangeHistory.create({
          data: {
            customerId: id,
            changedByUserId: actor.userId,
            actorType: actor.role,
            changes: changes as never,
          },
        }),
      ]);
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ERROR_CODES.PHONE_ALREADY_EXISTS,
          'Another customer already has this phone number',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
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
