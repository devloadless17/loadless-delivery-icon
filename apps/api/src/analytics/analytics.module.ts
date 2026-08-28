import { Module } from '@nestjs/common';
import {
  AdminAnalyticsController,
  DriverEarningsController,
  VendorAnalyticsController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { OrdersCsvService } from './orders-csv.service';

@Module({
  controllers: [AdminAnalyticsController, VendorAnalyticsController, DriverEarningsController],
  providers: [AnalyticsService, OrdersCsvService],
})
export class AnalyticsModule {}
