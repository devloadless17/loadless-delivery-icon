import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  addCustomerAddressSchema,
  adminUpdateCustomerSchema,
  type AdminUpdateCustomerInput,
  createCustomerSchema,
  customerSearchSchema,
  offsetPaginationSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type CustomerAddressInput,
  type CustomerSearchInput,
  type OffsetPagination,
  type UpdateCustomerInput,
} from '@loadless/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomersService } from './customers.service';

@Controller('customers')
@Roles('ADMIN', 'VENDOR')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** Exact-match phone lookup — the vendor's order-creation entry point. */
  @Get()
  async search(@Query(new ZodValidationPipe(customerSearchSchema)) query: CustomerSearchInput) {
    const customer = await this.customers.findByPhone(query.phone);
    return { customer }; // null when unknown — that's a valid answer, not a 404
  }

  @Post()
  @HttpCode(200)
  createOrReuse(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.createOrReuse(body, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.update(id, body, user);
  }

  @Post(':id/addresses')
  addAddress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addCustomerAddressSchema)) body: CustomerAddressInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.addAddress(id, body, user);
  }

  @Post(':id/addresses/:addressId/archive')
  @HttpCode(204)
  async archiveAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.customers.archiveAddress(id, addressId, user);
  }
}

const adminListSchema = offsetPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
});

@Controller('admin/customers')
@Roles('ADMIN')
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminListSchema)) query: OffsetPagination & { q?: string },
  ) {
    return this.customers.adminList(query, query.q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateCustomerSchema)) body: AdminUpdateCustomerInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.adminUpdate(id, body, user);
  }
}
