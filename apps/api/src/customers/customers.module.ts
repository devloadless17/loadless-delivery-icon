import { Module } from '@nestjs/common';
import {
  AdminCustomersController,
  CustomersController,
  VendorCustomersController,
} from './customers.controller';
import { CustomerDirectoryService } from './customer-directory.service';
import { CustomerProfileService } from './customer-profile.service';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController, VendorCustomersController, AdminCustomersController],
  providers: [CustomersService, CustomerProfileService, CustomerDirectoryService],
  exports: [CustomersService, CustomerProfileService],
})
export class CustomersModule {}
