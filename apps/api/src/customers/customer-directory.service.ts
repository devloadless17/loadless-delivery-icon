import { Injectable } from '@nestjs/common';
import type { MyCustomersFilter } from '@loadless/shared';
import { Prisma } from '@prisma/client';
import { offsetMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { vendorCustomerScope } from './customer-order.scope';

interface MyCustomerRow {
  id: string;
  base_name: string;
  display_name: string | null;
  normalized_phone: string;
  orders_count: number;
  last_order_at: Date | null;
  address_count: bigint;
  added_by_you: boolean;
}

/**
 * "My customers" — a vendor's own list.
 *
 * This is the one place the product deliberately does NOT give vendors what
 * the admin has. An admin may search the whole directory by name; a vendor may
 * only search the customers they actually deal with. Everyone else is reachable
 * by typing a full phone number and nothing else, which is the difference
 * between "help me serve the person on the line" and "let me browse my
 * competitor's client book".
 */
@Injectable()
export class CustomerDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async myCustomers(filter: MyCustomersFilter, actor: AuthUser) {
    // ------------------------------------------------------------------
    // THE most security-critical value in this feature. It comes from the
    // JWT via the shared scope helper and from nowhere else; the filter DTO
    // has no vendorId field, so an injected ?vendorId= is dropped by zod
    // before it can ever reach this query.
    // ------------------------------------------------------------------
    const vendorId = vendorCustomerScope(actor);

    const q = filter.q?.trim();
    // Phones are stored as +961…; a vendor types "70 123 456" or "03123456".
    const digits = q ? q.replace(/\D/g, '') : '';
    const search = q
      ? Prisma.sql`AND (
          COALESCE(cv."display_name", c."name") ILIKE ${'%' + q + '%'}
          ${digits.length >= 3 ? Prisma.sql`OR c."normalized_phone" LIKE ${'%' + digits + '%'}` : Prisma.empty}
        )`
      : Prisma.empty;

    const limit = filter.limit;
    const offset = (filter.page - 1) * filter.limit;

    // MATERIALIZED forces the page to be cut to `limit` rows BEFORE the
    // address-count subquery runs, so it executes exactly `limit` times
    // instead of once per link row the vendor owns.
    const rowsQuery = this.prisma.$queryRaw<MyCustomerRow[]>`
      WITH page AS MATERIALIZED (
        SELECT c."id",
               c."name"                AS base_name,
               c."normalized_phone",
               cv."display_name",
               cv."orders_count",
               cv."last_order_at",
               cv."last_activity_at",
               -- COALESCE: a platform-owned customer has a NULL creator,
               -- and NULL would arrive as null instead of false.
               COALESCE(c."created_by_vendor_id" = ${vendorId}, false) AS added_by_you
        FROM "customer_vendors" cv
        JOIN "customers" c ON c."id" = cv."customer_id"
        WHERE cv."vendor_id" = ${vendorId} ${search}
        -- Matches customer_vendors_vendor_activity_idx exactly: equality then
        -- an already-sorted range, so no Sort node and LIMIT stops early.
        ORDER BY cv."last_activity_at" DESC, cv."customer_id" DESC
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT p.*,
             (SELECT COUNT(*) FROM "customer_addresses" a
               WHERE a."customer_id" = p."id" AND a."is_archived" = false) AS address_count
      FROM page p
      ORDER BY p."last_activity_at" DESC, p."id" DESC`;

    const totalQuery = this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "customer_vendors" cv
      JOIN "customers" c ON c."id" = cv."customer_id"
      WHERE cv."vendor_id" = ${vendorId} ${search}`;

    const [rows, totalRows] = await this.prisma.$transaction([rowsQuery, totalQuery]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        // The alias wins on the vendor's own screen; without one they follow
        // the shared record, so a creator's typo fix still reaches them.
        name: row.display_name ?? row.base_name,
        baseName: row.base_name,
        displayName: row.display_name,
        normalizedPhone: row.normalized_phone,
        ordersCount: row.orders_count,
        lastOrderAt: row.last_order_at,
        // COUNT(*) is bigint; without Number() it serializes as a string and
        // every arithmetic comparison in the UI silently breaks.
        addressCount: Number(row.address_count),
        addedByYou: row.added_by_you,
      })),
      meta: offsetMeta(filter, Number(totalRows[0]?.count ?? 0)) as unknown as Record<
        string,
        unknown
      >,
    };
  }
}
