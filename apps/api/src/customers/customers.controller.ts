import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  addCustomerAddressSchema,
  customerOrderHistoryFilterSchema,
  updateCustomerAddressSchema,
  type CustomerOrderHistoryFilter,
  type UpdateCustomerAddressInput,
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
import { CustomerProfileService } from './customer-profile.service';
import { CustomersService } from './customers.service';

@Controller('customers')
@Roles('ADMIN', 'VENDOR')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly profiles: CustomerProfileService,
  ) {}

  /**
   * Exact-match phone lookup — the vendor types this while the customer is on
   * the line, so it returns the WHOLE profile (identity, addresses, stats,
   * recent orders) in one round trip. Throttled tighter than the global limit:
   * the payload is rich and the key (a Lebanese mobile) is guessable.
   */
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async search(
    @Query(new ZodValidationPipe(customerSearchSchema)) query: CustomerSearchInput,
    @CurrentUser() user: AuthUser,
  ) {
    const customer = await this.profiles.byPhone(query.phone, user);
    return { customer }; // null when unknown — a valid answer, not a 404
  }

  @Post()
  @HttpCode(200)
  async createOrReuse(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
    @CurrentUser() user: AuthUser,
  ) {
    const { customerId, created } = await this.customers.createOrReuse(body, user);
    return { customer: await this.profiles.build(customerId, user), created };
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.profiles.build(id, user);
  }

  /** Full order history with this customer — vendor-scoped, cursor-paginated. */
  @Get(':id/orders')
  listOrders(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(customerOrderHistoryFilterSchema)) filter: CustomerOrderHistoryFilter,
    @CurrentUser() user: AuthUser,
  ) {
    return this.profiles.listOrders(id, user, filter);
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

  @Patch(':id/addresses/:addressId')
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body(new ZodValidationPipe(updateCustomerAddressSchema)) body: UpdateCustomerAddressInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.updateAddress(id, addressId, body, user);
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
  constructor(
    private readonly customers: CustomersService,
    private readonly profiles: CustomerProfileService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminListSchema)) query: OffsetPagination & { q?: string },
  ) {
    return this.customers.adminList(query, query.q);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.profiles.build(id, user); // platform scope: every vendor's orders
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
