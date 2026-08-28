import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createDriverSchema,
  DUTY_STATUSES,
  offsetPaginationSchema,
  updateDriverSchema,
  type CreateDriverInput,
  type OffsetPagination,
  type UpdateDriverInput,
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
