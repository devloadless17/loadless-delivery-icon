/**
 * Internal domain events. Emitted by the service AFTER the transaction commits;
 * the realtime gateway maps them to rooms. Payloads carry rich types (Date),
 * which the gateway serialises for the wire.
 */
export const SETTLEMENT_EVENTS = {
  RECORDED: 'settlement.recorded',
  VOIDED: 'settlement.voided',
} as const;

export interface SettlementRecordedEvent {
  settlementId: string;
  settlementNumber: string;
  driverId: string;
  at: Date;
}

export interface SettlementVoidedEvent {
  settlementId: string;
  settlementNumber: string;
  driverId: string;
  at: Date;
}
