import { Injectable } from '@nestjs/common';
import { beirutRange, type AdminOrderListFilter } from '@loadless/shared';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 500;
const MAX_ROWS = 50_000;

/**
 * One CSV cell, safe to open in Excel or Sheets.
 *
 * Quoting handles the CSV format itself. The leading-character guard handles
 * something else entirely: a spreadsheet treats a cell starting with = + - @
 * (or a tab/CR that leaves one exposed) as a FORMULA, not text. Customer names
 * and delivery addresses are free text a vendor types, so `=HYPERLINK(...)` in
 * a customer name would execute when the admin opens the export — against the
 * one account worth attacking. Prefixing an apostrophe is the standard
 * neutraliser: the spreadsheet shows the original text and evaluates nothing.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  const disarmed = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(disarmed) ? `"${disarmed.replace(/"/g, '""')}"` : disarmed;
}

/** Streams the filtered order report in cursor batches — memory-flat at any size. */
@Injectable()
export class OrdersCsvService {
  constructor(private readonly prisma: PrismaService) {}

  async stream(filter: AdminOrderListFilter, res: Response): Promise<void> {
    const range = beirutRange(filter.from, filter.to);
    const where: Prisma.OrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
      ...(filter.driverId ? { driverId: filter.driverId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      // The SAME Beirut-day snapping the on-screen list uses
      // (OrdersService.adminList). Feeding the raw instants straight in made
      // the export answer a different question from the screen that produced
      // the filter: `to` cut at 00:00 UTC and dropped almost the whole last
      // day, `from` started three hours late. An admin reconciling their books
      // against a report that quietly omits a day has no way to see it.
      ...(range.from || range.to
        ? {
            createdAt: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {}),
    };

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.write(
      'orderNumber,createdAt,status,vendor,driver,customerName,customerPhone,address,currency,deliveryCharge,platformCommission,driverEarnings,deliveredAt\n',
    );

    let cursor: string | undefined;
    let written = 0;
    let truncated = false;
    for (;;) {
      const rows = await this.prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          currency: true,
          deliveryCharge: true,
          platformCommissionAmount: true,
          driverEarnings: true,
          deliveryAddressText: true,
          deliveredAt: true,
          vendor: { select: { businessName: true } },
          driver: { select: { fullName: true } },
          customer: { select: { name: true, normalizedPhone: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        res.write(
          [
            row.orderNumber,
            row.createdAt.toISOString(),
            row.status,
            csvCell(row.vendor.businessName),
            csvCell(row.driver?.fullName),
            csvCell(row.customer.name),
            // Through csvCell like the rest: a stored number is E.164
            // (`+9613123456`), and a bare leading + makes Excel evaluate the
            // cell as arithmetic — the phone arrives as 9613123456, stripped of
            // the + and unusable for calling the customer back.
            csvCell(row.customer.normalizedPhone),
            csvCell(row.deliveryAddressText),
            row.currency,
            row.deliveryCharge.toString(),
            row.platformCommissionAmount?.toString() ?? '',
            row.driverEarnings?.toString() ?? '',
            row.deliveredAt?.toISOString() ?? '',
          ].join(',') + '\n',
        );
      }
      written += rows.length;
      cursor = rows[rows.length - 1]?.id;
      if (rows.length < BATCH_SIZE) break;
      if (written >= MAX_ROWS) {
        truncated = true;
        break;
      }
    }

    // A report that stops at the cap must SAY it stopped. Without this the file
    // simply ends, and a year's orders cut to the newest 50,000 reads as the
    // complete set — the reader has no way to tell a short month from a
    // truncated one, and every total they compute from it is quietly wrong.
    if (truncated) {
      res.write(
        `# Truncated at ${MAX_ROWS} rows (the most recent). Narrow the date range or filters to export the rest.\n`,
      );
    }
    res.end();
  }
}
