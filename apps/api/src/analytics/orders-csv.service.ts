import { Injectable } from '@nestjs/common';
import type { AdminOrderListFilter } from '@loadless/shared';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 500;
const MAX_ROWS = 50_000;

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Streams the filtered order report in cursor batches — memory-flat at any size. */
@Injectable()
export class OrdersCsvService {
  constructor(private readonly prisma: PrismaService) {}

  async stream(filter: AdminOrderListFilter, res: Response): Promise<void> {
    const where: Prisma.OrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
      ...(filter.driverId ? { driverId: filter.driverId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
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
            row.customer.normalizedPhone,
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
      if (rows.length < BATCH_SIZE || written >= MAX_ROWS) break;
    }
    res.end();
  }
}
