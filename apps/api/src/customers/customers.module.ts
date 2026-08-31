import { Module } from '@nestjs/common';
import { AdminCustomersController, CustomersController } from './customers.controller';
import { CustomerProfileService } from './customer-profile.service';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController, AdminCustomersController],
  providers: [CustomersService, CustomerProfileService],
  exports: [CustomersService, CustomerProfileService],
})
export class CustomersModule {}
