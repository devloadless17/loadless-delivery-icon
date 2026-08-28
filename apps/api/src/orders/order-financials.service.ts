import { Injectable } from '@nestjs/common';
import { calcCommission, calcDriverEarnings } from '@loadless/shared';
import { SettingsService } from '../settings/settings.service';

export interface FinancialSnapshot {
  commissionBps: number;
  platformCommissionAmount: bigint;
  driverEarnings: bigint;
}

/**
 * The only place order money is computed. Deterministic, pure given inputs;
 * commission resolution is per-driver (override ?? platform default) and the
 * result is SNAPSHOTTED on the order at acceptance — later rate changes never
 * touch existing orders.
 */
@Injectable()
export class OrderFinancialsService {
  constructor(private readonly settings: SettingsService) {}

  async resolveCommissionBps(driverOverrideBps: number | null): Promise<number> {
    return driverOverrideBps ?? (await this.settings.defaultCommissionBps());
  }

  computeSnapshot(deliveryCharge: bigint, commissionBps: number): FinancialSnapshot {
    const platformCommissionAmount = calcCommission(deliveryCharge, commissionBps);
    return {
      commissionBps,
      platformCommissionAmount,
      driverEarnings: calcDriverEarnings(deliveryCharge, platformCommissionAmount),
    };
  }
}
