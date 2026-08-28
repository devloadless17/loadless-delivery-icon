import { Module } from '@nestjs/common';
import { AdminDriversController, DriverProfileController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [AdminDriversController, DriverProfileController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
