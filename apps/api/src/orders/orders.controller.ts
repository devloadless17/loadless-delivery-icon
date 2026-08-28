import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  adminOrderListFilterSchema,
  adminAssignOrderSchema,
  adminReassignOrderSchema,
  createOrderSchema,
  cursorPaginationSchema,
  orderListFilterSchema,
  orderReasonSchema,
  type AdminOrderListFilter,
  type CreateOrderInput,
  type CursorPagination,
  type OrderListFilter,
  type OrderReasonInput,
} from '@loadless/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersService } from './orders.service';

@Controller('vendor/orders')
@Roles('VENDOR')
export class VendorOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.create(body, user.vendorId as string, user);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(orderListFilterSchema)) filter: OrderListFilter,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.vendorList(user.vendorId as string, filter);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.vendorGet(id, user.vendorId as string);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: OrderReasonInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.vendorCancel(id, user.vendorId as string, body.reason, user);
  }
}

@Controller('driver/orders')
@Roles('DRIVER')
export class DriverOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Get('available')
  available(@Query(new ZodValidationPipe(cursorPaginationSchema)) page: CursorPagination) {
    return this.orders.availableFeed(page);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(cursorPaginationSchema.extend({}))) page: CursorPagination,
    @Query('scope') scope: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.driverList(
      user.driverId as string,
      scope === 'history' ? 'history' : 'active',
      page,
    );
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.driverGet(id, user.driverId as string);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lifecycle.accept(id, user.driverId as string, user);
  }

  @Post(':id/pickup')
  @HttpCode(200)
  pickup(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lifecycle.pickup(id, user);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  deliver(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lifecycle.deliver(id, user);
  }

  @Post(':id/release')
  @HttpCode(200)
  release(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: OrderReasonInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.release(id, body.reason, user);
  }

  @Post(':id/fail')
  @HttpCode(200)
  fail(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: OrderReasonInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.fail(id, body.reason, user);
  }
}

@Controller('admin/orders')
@Roles('ADMIN')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(adminOrderListFilterSchema)) filter: AdminOrderListFilter) {
    return this.orders.adminList(filter);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.adminGet(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: OrderReasonInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.adminCancel(id, body.reason, user);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminAssignOrderSchema)) body: { driverId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.accept(id, body.driverId, user);
  }

  @Post(':id/reassign')
  @HttpCode(200)
  reassign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminReassignOrderSchema))
    body: { driverId: string; reason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.adminReassign(id, body.driverId, body.reason, user);
  }
}
