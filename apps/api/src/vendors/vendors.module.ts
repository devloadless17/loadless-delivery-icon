import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { AdminVendorsController, VendorProfileController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  // FilesModule so deleting a vendor can drop its logo through FilesService —
  // storage itself stays behind that seam, never touched from here.
  imports: [FilesModule],
  controllers: [AdminVendorsController, VendorProfileController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
