import { Module } from '@nestjs/common';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';

@Module({
  // UsersModule and AuthModule are @Global; only AuditModule needs importing,
  // and it is global too — so this module carries nothing of its own.
  controllers: [AdminsController],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminsModule {}
