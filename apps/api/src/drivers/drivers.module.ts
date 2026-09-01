import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { AdminDriversController, DriverDutyController, DriverProfileController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  // FilesModule so deleting a driver takes their ID and bike photos with them,
  // through FilesService — storage itself stays behind that seam.
  imports: [FilesModule],
  controllers: [AdminDriversController, DriverProfileController, DriverDutyController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
