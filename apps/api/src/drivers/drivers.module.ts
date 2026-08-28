import { Module } from '@nestjs/common';
import { AdminDriversController, DriverDutyController, DriverProfileController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [AdminDriversController, DriverProfileController, DriverDutyController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
