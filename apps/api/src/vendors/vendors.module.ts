import { Module } from '@nestjs/common';
import { AdminVendorsController, VendorProfileController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  controllers: [AdminVendorsController, VendorProfileController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
