import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
  myCustomersFilterSchema,
  platformLookupSchema,
  setCustomerDisplayNameSchema,
  type PlatformLookupInput,
  type MyCustomersFilter,
  type SetCustomerDisplayNameInput,
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
import { CustomerDirectoryService } from './customer-directory.service';
import { CustomerProfileService } from './customer-profile.service';
import { CustomersService } from './customers.service';

@Controller('customers')
@Roles('ADMIN', 'VENDOR')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly profiles: CustomerProfileService,
    private readonly directory: CustomerDirectoryService,
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

  /**
   * Candidates for a phone number the vendor has not finished typing.
   *
   * Throttled tighter than the profile lookup above: this is the only route
   * that answers about people the caller has never served, so it is the one an
   * enumeration attempt would reach for. It returns identity only — see
   * CustomerDirectoryService.platformLookup for why each limit is there.
   */
  @Get('lookup')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async lookup(
    @Query(new ZodValidationPipe(platformLookupSchema)) query: PlatformLookupInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.directory.platformLookup(query.q, user);
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

  /**
   * The name EVERY vendor sees. Admin, or the vendor who added the customer;
   * anyone else gets 403 NAME_NOT_YOURS and is pointed at their own alias.
   *
   * Two routes rather than one overloaded one on purpose: "rename for
   * everybody" and "rename for me" are different acts with different blast
   * radii, and a single endpoint that silently picks between them would be
   * exactly the confusion this feature exists to remove.
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @CurrentUser() user: AuthUser,
  ) {
    await this.customers.update(id, body, user);
    // Every customer route answers with the SAME full profile. A write that
    // returned only the identity fields would look like a profile to the
    // client, get written into the cache, and take the panel down when it
    // reached for stats that were never there.
    return this.profiles.build(id, user);
  }

  /** My private name for this customer. Nobody else ever sees it. */
  @Put(':id/display-name')
  async setDisplayName(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setCustomerDisplayNameSchema)) body: SetCustomerDisplayNameInput,
    @CurrentUser() user: AuthUser,
  ) {
    await this.customers.setDisplayName(id, body.displayName, user);
    return this.profiles.build(id, user);
  }

  /** Drop my private name and follow the shared record again. */
  @Delete(':id/display-name')
  async clearDisplayName(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.customers.clearDisplayName(id, user);
    return this.profiles.build(id, user);
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

/**
 * "My customers" — the vendor's own, bounded list.
 *
 * Separate controller because it carries a different guarantee from everything
 * in CustomersController: those routes act on ONE customer the caller already
 * named by phone or id, while this one enumerates. Enumeration is the
 * capability the shared-customer model withholds, so it lives where it is
 * obvious and is scoped by the JWT alone.
 */
@Controller('vendor/customers')
@Roles('VENDOR')
export class VendorCustomersController {
  constructor(private readonly directory: CustomerDirectoryService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(myCustomersFilterSchema)) query: MyCustomersFilter,
    @CurrentUser() user: AuthUser,
  ) {
    return this.directory.myCustomers(query, user);
  }
}

const adminListSchema = offsetPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  /** Narrow the directory to one vendor's customers. ADMIN only, by route. */
  vendorId: z.string().trim().min(1).max(40).optional(),
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
    @Query(new ZodValidationPipe(adminListSchema))
    query: OffsetPagination & { q?: string; vendorId?: string },
  ) {
    return this.customers.adminList(query, query.q, query.vendorId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.profiles.build(id, user); // platform scope: every vendor's orders
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateCustomerSchema)) body: AdminUpdateCustomerInput,
    @CurrentUser() user: AuthUser,
  ) {
    await this.customers.adminUpdate(id, body, user);
    return this.profiles.build(id, user); // same full shape as every read
  }
}
