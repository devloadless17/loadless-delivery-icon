import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateCustomerInput,
  CustomerAddressInput,
  OffsetPagination,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from '@loadless/shared';
import { ERROR_CODES, normalizeAddressKey, phoneSearchDigits } from '@loadless/shared';
import { Prisma, type AddressLabel } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { offsetArgs, offsetMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import {
  ADDRESS_SELECT,
  CUSTOMER_SELECT,
  projectAddress,
  projectCustomer,
} from './customer.select';
import { adminVendorLinkFilter, vendorCustomerScope } from './customer-order.scope';

type Tx = Prisma.TransactionClient;


/**
 * Customers are GLOBAL: shared across all vendors, keyed by normalized phone.
 * Any active vendor may look one up by phone and add addresses; every edit
 * leaves a change-history diff.
 *
 * A vendor ADDS customers and addresses; only ADMIN edits them afterwards. The
 * shared record is the platform's to keep correct, which is the only way it
 * stays trustworthy for every shop reading it:
 *
 *   phone (identity)     -> ADMIN only
 *   the global name      -> ADMIN only
 *   any saved address    -> ADMIN edits and archives; any vendor may ADD one
 *   your private name    -> you only, and only you ever see it
 *   THIS ORDER's address -> the vendor's, freely, touching no shared row
 *
 * That last line is what makes the rest affordable: a vendor never needs to
 * edit the profile to get a delivery to the right door.
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

  /** The caller's own private name for this customer (null for ADMIN). */
  private async myAlias(customerId: string, actor: AuthUser): Promise<string | null> {
    if (actor.role !== 'VENDOR' || !actor.vendorId) return null;
    const link = await this.prisma.customerVendor.findUnique({
      where: { customerId_vendorId: { customerId, vendorId: actor.vendorId } },
      select: { displayName: true },
    });
    return link?.displayName ?? null;
  }

  /**
   * Rewrite the name EVERY vendor sees. ADMIN only — the route enforces it.
   *
   * A vendor who wants a different name sets their own alias instead, so the
   * shared record never moves under anyone.
   */
  async update(id: string, input: UpdateCustomerInput, actor: AuthUser) {
    const existing = await this.get(id);
    const alias = await this.myAlias(id, actor);
    if (input.name === undefined || input.name === existing.name) {
      return projectCustomer(actor, existing, alias);
    }

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
    return projectCustomer(actor, updated, alias);
  }

  /**
   * Set MY private name for a customer. Nothing about the shared record moves;
   * no other vendor and no driver ever sees this string.
   *
   * An alias equal to the base name is stored as NULL rather than as a copy:
   * the vendor plainly meant "this name", so they should keep receiving the
   * creator's future corrections instead of freezing today's spelling.
   */
  async setDisplayName(customerId: string, displayName: string, actor: AuthUser) {
    const vendorId = vendorCustomerScope(actor);
    const customer = await this.get(customerId);
    const value = displayName === customer.name ? null : displayName;

    await this.prisma.customerVendor.upsert({
      where: { customerId_vendorId: { customerId, vendorId } },
      // The link may not exist yet: looking a customer up does not create one,
      // only creating them or ordering for them does.
      create: { customerId, vendorId, displayName: value },
      update: { displayName: value },
    });
    return projectCustomer(actor, customer, value);
  }

  /** Drop my alias and follow the global name again. */
  async clearDisplayName(customerId: string, actor: AuthUser) {
    const vendorId = vendorCustomerScope(actor);
    const customer = await this.get(customerId);
    await this.prisma.customerVendor.updateMany({
      where: { customerId, vendorId },
      data: { displayName: null },
    });
    return projectCustomer(actor, customer, null);
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
  ): Promise<{ id: string; created: boolean; matchedOn?: 'link' | 'text' }> {
    const existing = await tx.customerAddress.findMany({
      where: { customerId, isArchived: false }, // index [customerId, isArchived]
      select: { id: true, addressText: true, mapsUrl: true },
    });

    const key = normalizeAddressKey(input.addressText);
    const link = input.mapsUrl?.trim() || null;
    // The link wins when both could match: a shared pin is the same PLACE
    // however the two descriptions differ. Which one matched is reported back
    // — telling someone "that address already exists" when it was their pin
    // that collided sends them off editing the wrong field.
    const linkMatch = link ? existing.find((a) => a.mapsUrl?.trim() === link) : undefined;
    // A link-only address has no text key, so it can only match on the link.
    const textMatch = key
      ? existing.find((a) => normalizeAddressKey(a.addressText) === key)
      : undefined;
    const match = linkMatch ?? textMatch;
    const matchedOn = linkMatch ? ('link' as const) : ('text' as const);

    if (match) {
      // Filling a blank maps link on an EXISTING row is still a write to a
      // shared address, so it is admin-only like every other address edit. A
      // vendor's link still rides on the order, which is what the driver taps.
      if (link && !match.mapsUrl && actor.role === 'ADMIN') {
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
      return { id: match.id, created: false, matchedOn };
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

  /**
   * Explicit "add address" — same dedupe rule as the order path.
   *
   * Reports `created`. The dedupe means an add can legitimately change
   * nothing: saving a byte-identical copy of an address that already exists
   * returns the existing row. The caller MUST be able to tell, or the UI ends
   * up saying "Address saved" when nothing was saved.
   */
  async addAddress(customerId: string, input: CustomerAddressInput, actor: AuthUser) {
    await this.get(customerId); // 404 guard
    const { id, created, matchedOn } = await this.prisma.$transaction((tx) =>
      this.saveAddressInTx(tx, customerId, input, actor),
    );
    const row = await this.prisma.customerAddress.findUniqueOrThrow({
      where: { id },
      select: ADDRESS_SELECT,
    });
    return { ...projectAddress(actor, row), created, ...(matchedOn ? { matchedOn } : {}) };
  }


  /** Correct a saved address in place. ADMIN only (enforced on the route). */
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
      // no-op writes no history
      if (Object.keys(diff).length === 0) return projectAddress(actor, existing);

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
        return projectAddress(actor, updated);
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
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId, isArchived: false },
        select: { id: true },
      });
      if (!existing) throw AppException.notFound('Address not found');

      // Still a conditional updateMany: the read above answers "who owns it",
      // not "is it still unarchived", and only the WHERE can answer that
      // without a race.
      const result = await tx.customerAddress.updateMany({
        where: { id: addressId, customerId, isArchived: false },
        data: { isArchived: true },
      });
      if (result.count === 0) throw AppException.notFound('Address not found');

      await tx.customerChangeHistory.create({
        data: {
          customerId,
          changedByUserId: actor.userId,
          actorType: actor.role,
          changes: { addressArchived: { old: addressId } },
        },
      });
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
    if (Object.keys(changes).length === 0) return projectCustomer(actor, existing, null);

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
      return projectCustomer(actor, updated, null); // ADMIN never has an alias
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

  /**
   * Admin browsing — the ONLY name-searchable listing of the whole directory.
   * Vendors get `myCustomers` instead, which is bounded to their own links.
   * `vendorId` narrows it to one vendor's customers (served by the link PK).
   */
  async adminList(pagination: OffsetPagination, q?: string, vendorId?: string) {
    const where: Prisma.CustomerWhereInput = {
      ...adminVendorLinkFilter(vendorId),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              // Stored as "+9613123456"; a typed "03 12" must become "312" or
              // it matches nothing at all. startsWith, because numbers are
              // read left to right.
              ...(phoneSearchDigits(q)
                ? [{ normalizedPhone: { startsWith: `+961${phoneSearchDigits(q)}` } }]
                : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: {
          id: true,
          normalizedPhone: true,
          name: true,
          createdAt: true,
          createdByVendor: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...offsetArgs(pagination),
      }),
      this.prisma.customer.count({ where }),
    ]);

    // Counted in a second pass, scoped to THIS PAGE's ids, rather than with
    // Prisma's `_count: { select: … }`.
    //
    // That convenience compiles to one full-table GROUP BY per relation, JOINed
    // to customers and only THEN limited — so rendering 20 rows aggregated
    // every order, address and link on the platform. Measured on 400k orders:
    // 189ms, growing with the whole database. Scoped to 20 ids it is ~0.4ms and
    // grows with nothing.
    const ids = rows.map((row) => row.id);
    // Bound to consts with an explicit orderBy: Prisma's groupBy result type
    // only narrows _count at the call site (same reason customer-profile
    // binds its queries before the transaction).
    const orderCountQuery = this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids } },
      orderBy: { customerId: 'asc' },
      _count: { _all: true },
    });
    const addressCountQuery = this.prisma.customerAddress.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, isArchived: false },
      orderBy: { customerId: 'asc' },
      _count: { _all: true },
    });
    const linkCountQuery = this.prisma.customerVendor.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids } },
      orderBy: { customerId: 'asc' },
      _count: { _all: true },
    });
    const [orderCounts, addressCounts, linkCounts] = await this.prisma.$transaction([
      orderCountQuery,
      addressCountQuery,
      linkCountQuery,
    ]);
    const tally = (groups: Array<{ customerId: string; _count: { _all: number } }>) =>
      new Map(groups.map((g) => [g.customerId, g._count._all]));
    const byOrders = tally(orderCounts);
    const byAddresses = tally(addressCounts);
    const byLinks = tally(linkCounts);

    const data = rows.map((row) => ({
      ...row,
      // Same wire shape the admin table already reads.
      _count: {
        orders: byOrders.get(row.id) ?? 0,
        addresses: byAddresses.get(row.id) ?? 0,
        vendorLinks: byLinks.get(row.id) ?? 0,
      },
    }));
    return { data, meta: offsetMeta(pagination, total) as unknown as Record<string, unknown> };
  }
}
