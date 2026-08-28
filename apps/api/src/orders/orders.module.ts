import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { OrderFinancialsService } from './order-financials.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import {
  AdminOrdersController,
  DriverOrdersController,
  VendorOrdersController,
} from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CustomersModule],
  controllers: [VendorOrdersController, DriverOrdersController, AdminOrdersController],
  providers: [OrdersService, OrderLifecycleService, OrderFinancialsService],
  exports: [OrdersService, OrderLifecycleService],
})
export class OrdersModule {}
