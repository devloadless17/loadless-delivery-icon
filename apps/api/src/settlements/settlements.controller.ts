import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createSettlementSchema,
  outstandingQuerySchema,
  settlementListQuerySchema,
  settlementPreviewQuerySchema,
  voidSettlementSchema,
  type CreateSettlementInput,
  type OutstandingQuery,
  type SettlementListQuery,
  type SettlementPreviewQuery,
  type VoidSettlementInput,
} from '@loadless/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { AppException } from '../common/app.exception';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettlementsService } from './settlements.service';

/**
 * The admin's end-of-day surface: who owes what, what a handover would come to,
 * and the record of it once the cash is in hand.
 */
@Controller('admin/settlements')
@Roles('ADMIN')
export class AdminSettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  /** Every driver with money on him right now. The worklist. */
  @Get('outstanding')
  outstanding(@Query(new ZodValidationPipe(outstandingQuerySchema)) query: OutstandingQuery) {
    return this.settlements.outstanding(query);
  }

  @Get()
  list(@Query(new ZodValidationPipe(settlementListQuerySchema)) query: SettlementListQuery) {
    return this.settlements.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.settlements.get(id);
  }

  @Post(':id/void')
  voidSettlement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidSettlementSchema)) body: VoidSettlementInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settlements.void(id, body.reason, user);
  }
}

/**
 * Settling lives under the driver, because that is how the job reads: you settle
 * WITH a person, not with an abstract settlement.
 */
@Controller('admin/drivers/:driverId/settlements')
@Roles('ADMIN')
export class AdminDriverSettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  /** What the handover WOULD come to. Persists nothing. */
  @Get('preview')
  preview(
    @Param('driverId') driverId: string,
    @Query(new ZodValidationPipe(settlementPreviewQuerySchema)) query: SettlementPreviewQuery,
  ) {
    return this.settlements.preview(driverId, query.cutoffAt);
  }

  @Post()
  settle(
    @Param('driverId') driverId: string,
    @Body(new ZodValidationPipe(createSettlementSchema)) body: CreateSettlementInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settlements.settle(driverId, body, user);
  }
}

/**
 * The driver's own half. He sees the same running figure the admin collects
 * against — before the handover so he can count his cash, and after it so he
 * can see that nothing is left on him.
 */
@Controller('driver/settlements')
@Roles('DRIVER')
export class DriverSettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.settlements.owedByDriver(requireDriverId(user));
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(settlementListQuerySchema)) query: SettlementListQuery,
  ) {
    return this.settlements.listForDriver(requireDriverId(user), query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    // Scoped in the WHERE, not fetched-then-compared: someone else's receipt is
    // a 404, because confirming it exists would leak who settled what.
    return this.settlements.get(id, requireDriverId(user));
  }
}

function requireDriverId(user: AuthUser): string {
  if (!user.driverId) throw AppException.forbidden('No driver profile on this account');
  return user.driverId;
}
