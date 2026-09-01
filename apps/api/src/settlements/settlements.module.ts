import { Module } from '@nestjs/common';
import {
  AdminDriverSettlementsController,
  AdminSettlementsController,
  DriverSettlementsController,
} from './settlements.controller';
import { SettlementsService } from './settlements.service';

@Module({
  controllers: [
    AdminSettlementsController,
    AdminDriverSettlementsController,
    DriverSettlementsController,
  ],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
