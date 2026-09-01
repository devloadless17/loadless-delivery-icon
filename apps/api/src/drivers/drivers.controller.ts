import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createDriverSchema,
  DUTY_STATUSES,
  offsetPaginationSchema,
  updateDriverSchema,
  dutySchema,
  type CreateDriverInput,
  type OffsetPagination,
  type UpdateDriverInput,
  type DutyInput,
} from '@loadless/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DriversService } from './drivers.service';

const listQuerySchema = offsetPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  dutyStatus: z.enum(DUTY_STATUSES).optional(),
});

@Controller('admin/drivers')
@Roles('ADMIN')
export class AdminDriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createDriverSchema)) body: CreateDriverInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.drivers.create(body, user);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listQuerySchema))
    query: OffsetPagination & { q?: string; dutyStatus?: 'ON_DUTY' | 'OFF_DUTY' },
  ) {
    return this.drivers.list(query, { q: query.q, dutyStatus: query.dutyStatus });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.drivers.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDriverSchema)) body: UpdateDriverInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.drivers.update(id, body, user);
  }

  /**
   * Removes a driver who has never carried an order. One who has is refused
   * with DRIVER_HAS_ORDERS — see DriversService.remove: orders.driver_id is
   * ON DELETE SET NULL, so this check is the only thing preventing earnings
   * being silently detached from the person who earned them.
   */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.drivers.remove(id, user);
  }
}

@Controller('driver/profile')
@Roles('DRIVER')
export class DriverProfileController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.drivers.selfGet(user.driverId as string);
  }
}

@Controller('driver/duty')
@Roles('DRIVER')
export class DriverDutyController {
  constructor(private readonly drivers: DriversService) {}

  @Patch()
  setDuty(
    @Body(new ZodValidationPipe(dutySchema)) body: DutyInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.drivers.setDuty(user.driverId as string, body.dutyStatus);
  }
}
