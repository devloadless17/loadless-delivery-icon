import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  adminOrderListFilterSchema,
  dateRangeSchema,
  type AdminOrderListFilter,
  type DateRange,
} from '@loadless/shared';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';
import { OrdersCsvService } from './orders-csv.service';

@Controller('admin/analytics')
@Roles('ADMIN')
export class AdminAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly csv: OrdersCsvService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.analytics.adminDashboard();
  }

  @Get('drivers')
  driverPerformance(@Query(new ZodValidationPipe(dateRangeSchema)) range: DateRange) {
    return this.analytics.driverPerformance(range.from, range.to);
  }

  @Get('orders.csv')
  async ordersCsv(
    @Query(new ZodValidationPipe(adminOrderListFilterSchema)) filter: AdminOrderListFilter,
    @Res() res: Response,
  ) {
    await this.csv.stream(filter, res);
  }
}

@Controller('vendor/analytics')
@Roles('VENDOR')
export class VendorAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  stats(
    @Query(new ZodValidationPipe(dateRangeSchema)) range: DateRange,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.vendorStats(user.vendorId as string, range.from, range.to);
  }
}

@Controller('driver/earnings')
@Roles('DRIVER')
export class DriverEarningsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  earnings(
    @Query(new ZodValidationPipe(dateRangeSchema)) range: DateRange,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.driverEarnings(user.driverId as string, range.from, range.to);
  }
}
