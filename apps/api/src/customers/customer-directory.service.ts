import { Injectable } from '@nestjs/common';
import {
  phoneSearchDigits,
  PLATFORM_LOOKUP_LIMIT,
  PLATFORM_LOOKUP_MIN_DIGITS,
  type MyCustomersFilter,
  type PlatformCustomerMatch,
} from '@loadless/shared';
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
    // Search as they type: any prefix of a name, or any prefix of a number.
    //
    // The phone half must go through phoneSearchDigits — numbers are stored as
    // "+9613123456" with the leading 0 dropped, so matching the literal typed
    // "03 12" would find nothing. Anchored with a prefix LIKE rather than a
    // contains: people read numbers left to right, and '+961…%' can ride the
    // index instead of scanning.
    const digits = q ? phoneSearchDigits(q) : '';
    const like = `%${q}%`;
    // Split rather than COALESCE(display_name, name): each side can then use
    // its own trigram index, and a vendor who renamed someone can still find
    // them by the name the rest of the platform uses.
    const search = q
      ? Prisma.sql`AND (
          c."name" ILIKE ${like} OR cv."display_name" ILIKE ${like}
          ${digits ? Prisma.sql`OR c."normalized_phone" LIKE ${'+961' + digits + '%'}` : Prisma.empty}
        )`
      : Prisma.empty;
    // The count must stay ANCHORED on customer_vendors. Written as a join with
    // the filter on c.*, the planner flips it into a sequential scan of every
    // customer on the platform (measured: 120k-row seq scan, 21ms per
    // keystroke). EXISTS keeps the vendor's own links as the driving table.
    const countSearch = q
      ? Prisma.sql`AND (
          cv."display_name" ILIKE ${like}
          ${digits ? Prisma.sql`OR c."normalized_phone" LIKE ${'+961' + digits + '%'}` : Prisma.empty}
          OR EXISTS (SELECT 1 FROM "customers" c2
                      WHERE c2."id" = cv."customer_id" AND c2."name" ILIKE ${like})
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
      WHERE cv."vendor_id" = ${vendorId} ${countSearch}`;

    // Promise.all, NOT $transaction: a transaction pins both statements to one
    // connection and runs them back to back, so the request pays their latency
    // in series (measured 38ms -> 20ms for a vendor with ~10k customers). The
    // snapshot consistency a transaction would buy is worth nothing here — the
    // page and the total feed a list that changes under the reader anyway.
    // (The customer profile keeps its transaction for the opposite reason: its
    // numbers are compared against each other on screen.)
    const [rows, totalRows] = await Promise.all([rowsQuery, totalQuery]);

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

  /**
   * Who else on the platform has a number starting with these digits.
   *
   * This is the one read that deliberately crosses the vendor boundary, so
   * every limit on it is load-bearing:
   *
   *   - PHONE ONLY. `q` is reduced to digits and anything else is ignored, so
   *     a name can never reach past the caller's own customers.
   *   - A PREFIX of at least PLATFORM_LOOKUP_MIN_DIGITS. Fewer digits would
   *     turn this into a directory you can walk a bucket at a time.
   *   - IDENTITY ONLY. Name and number — precisely what typing the complete
   *     number already returns, and nothing the vendor could not get that way.
   *     No address, no order, no stat, no hint of who else serves them.
   *
   * The route is throttled harder than the rest of the API for the same reason.
   */
  async platformLookup(
    q: string,
    actor: AuthUser,
  ): Promise<{ matches: PlatformCustomerMatch[]; hasMore: boolean }> {
    // ADMIN has the full directory already; VENDOR is the case this exists for.
    // Anyone else (a driver reaching this by mistake) gets nothing.
    if (actor.role !== 'VENDOR' && actor.role !== 'ADMIN') {
      return { matches: [], hasMore: false };
    }

    const digits = phoneSearchDigits(q);
    if (digits.length < PLATFORM_LOOKUP_MIN_DIGITS) return { matches: [], hasMore: false };

    // Prefix scan on the unique index over normalized_phone, minus the
    // caller's own customers — those are already listed above with their real
    // context, and repeating them here as bare names would read as two
    // different people.
    // The caller's OWN customers are included and flagged, not filtered out
    // here. Which of them to show is a question about the screen, not about
    // the data: the customers page already lists them above and drops them,
    // while the order form has no such list — filtering there would hide the
    // very people the vendor deals with most.
    const vendorId = actor.role === 'VENDOR' ? actor.vendorId : null;

    // One past the cap, so the UI can say "keep typing" instead of quietly
    // hiding the person the vendor is actually looking for.
    const rows = await this.prisma.customer.findMany({
      where: { normalizedPhone: { startsWith: `+961${digits}` } },
      select: {
        id: true,
        name: true,
        normalizedPhone: true,
        // Only ever the CALLER's own link — never a hint of anyone else's.
        ...(vendorId
          ? { vendorLinks: { where: { vendorId }, select: { vendorId: true }, take: 1 } }
          : {}),
      },
      orderBy: { normalizedPhone: 'asc' },
      take: PLATFORM_LOOKUP_LIMIT + 1,
    });

    const matches = rows.slice(0, PLATFORM_LOOKUP_LIMIT).map((row) => {
      const { vendorLinks, ...identity } = row as typeof row & {
        vendorLinks?: Array<{ vendorId: string }>;
      };
      return { ...identity, isYours: (vendorLinks?.length ?? 0) > 0 };
    });
    return { matches, hasMore: rows.length > PLATFORM_LOOKUP_LIMIT };
  }
}
