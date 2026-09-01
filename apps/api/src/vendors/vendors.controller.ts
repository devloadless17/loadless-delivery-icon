import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createVendorSchema,
  offsetPaginationSchema,
  updateVendorSchema,
  vendorSelfUpdateSchema,
  type CreateVendorInput,
  type OffsetPagination,
  type UpdateVendorInput,
  type VendorSelfUpdateInput,
} from '@loadless/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VendorsService } from './vendors.service';

const listQuerySchema = offsetPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
});

@Controller('admin/vendors')
@Roles('ADMIN')
export class AdminVendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createVendorSchema)) body: CreateVendorInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.create(body, user);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listQuerySchema))
    query: OffsetPagination & { q?: string },
  ) {
    return this.vendors.list(query, query.q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.vendors.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateVendorSchema)) body: UpdateVendorInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.update(id, body, user);
  }

  /**
   * Removes a vendor who has never taken an order. One who has is refused with
   * VENDOR_HAS_ORDERS — see VendorsService.remove for why that is an accounting
   * rule rather than a permissions one.
   */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.vendors.remove(id, user);
  }
}

@Controller('vendor/profile')
@Roles('VENDOR')
export class VendorProfileController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.vendors.selfGet(user.vendorId as string);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(vendorSelfUpdateSchema)) body: VendorSelfUpdateInput,
  ) {
    return this.vendors.selfUpdate(user.vendorId as string, body);
  }
}
