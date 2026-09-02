import { Controller, Get, Query } from '@nestjs/common';
import { offsetPaginationSchema, type OffsetPagination } from '@loadless/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { offsetArgs, offsetMeta } from '../common/pagination';

@Controller('admin/audit-logs')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(offsetPaginationSchema)) pagination: OffsetPagination) {
    // Promise.all, not $transaction([a, b]): $transaction runs them in SERIES
    // on one connection, and a page and its total are never compared to each
    // other on screen, so they gain nothing from sharing a snapshot and pay
    // for it in latency.
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        ...offsetArgs(pagination),
      }),
      this.prisma.auditLog.count(),
    ]);
    return { data: rows, meta: offsetMeta(pagination, total) };
  }
}
