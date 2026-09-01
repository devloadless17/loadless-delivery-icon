-- ===========================================================================
-- Guards for the end-of-day cash handover.
--
-- A follow-up to 20260901150548_driver_settlements rather than an edit to it:
-- that migration had already been applied to production when these guards were
-- written, and Prisma checksums applied migrations. Editing one in place makes
-- `migrate deploy` refuse to run against every database that already has it.
-- The tables it created are still EMPTY everywhere, so nothing here needs a
-- backfill — but each statement is written to be safe if that ever changes.
--
-- These tables record money that PHYSICALLY CHANGED HANDS, so the arithmetic
-- lives in the database rather than only in the service that writes it. If a
-- future code path — a script, a backfill, a well-meaning fix — ever produces a
-- line whose parts do not add up, the write fails instead of quietly putting
-- the platform's books out by the difference.
--
-- The shape of a line, per currency:
--     total_due       = commission_due + adjustments_total + brought_forward
--     carried_forward = total_due - amount_collected
-- and carried_forward becomes the driver's new outstanding balance.
-- ===========================================================================

-- 1. Line arithmetic ---------------------------------------------------------
ALTER TABLE "driver_settlement_lines" ADD CONSTRAINT settlement_line_total_exact
  CHECK ("total_due" = "commission_due" + "adjustments_total" + "brought_forward");

ALTER TABLE "driver_settlement_lines" ADD CONSTRAINT settlement_line_carry_exact
  CHECK ("carried_forward" = "total_due" - "amount_collected");

-- Commission owed and cash collected can never be negative; adjustments,
-- brought_forward and carried_forward are signed on purpose.
ALTER TABLE "driver_settlement_lines" ADD CONSTRAINT settlement_line_nonneg
  CHECK ("commission_due" >= 0 AND "amount_collected" >= 0
     AND "gross_charge" >= 0 AND "order_count" >= 0);

-- A line with no orders must be justified by an adjustment or a carried debt,
-- otherwise it is noise on the receipt.
ALTER TABLE "driver_settlement_lines" ADD CONSTRAINT settlement_line_not_empty
  CHECK ("order_count" > 0 OR "adjustments_total" <> 0 OR "brought_forward" <> 0
         OR "amount_collected" <> 0);

-- 2. Adjustment sign discipline ---------------------------------------------
-- Amounts are signed in "what the driver owes" terms. A fine can only ever
-- increase the debt and a bonus can only ever reduce it; only a correction is
-- free to point either way. Mirrors ADJUSTMENT_DIRECTION_BY_TYPE in
-- packages/shared/src/enums.ts — the two must stay in step.
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT adjustment_sign_by_type
  CHECK ( ("type" IN ('FINE', 'ADVANCE') AND "amount" > 0)
       OR ("type" = 'BONUS'              AND "amount" < 0)
       OR ("type" = 'CORRECTION'         AND "amount" <> 0) );

ALTER TABLE "settlement_adjustments" ADD CONSTRAINT adjustment_reason_present
  CHECK (length(btrim("reason")) >= 3);

-- 3. Which orders may be settled --------------------------------------------
-- ONLY a delivered order. This is the structural half of an invariant that is
-- easy to get wrong in application code: an admin cancel from PICKED_UP, and a
-- FAILED delivery, both LEAVE THE COMMISSION SNAPSHOT POPULATED. Neither
-- collected a fee from anybody. "The snapshot is set" is therefore not a
-- synonym for "commission is owed" — only status = 'DELIVERED' is.
ALTER TABLE "orders" ADD CONSTRAINT order_settled_only_when_delivered
  CHECK ("settlement_id" IS NULL OR "status" = 'DELIVERED');

-- A settlement is the record of collected cash and is never hard-deleted, so
-- SET NULL (which would silently unsettle its orders) is the wrong rule. The
-- Prisma schema declares onDelete: Restrict; this brings the database in step.
ALTER TABLE "orders" DROP CONSTRAINT "orders_settlement_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "driver_settlements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. A void must be fully attributed ----------------------------------------
ALTER TABLE "driver_settlements" ADD CONSTRAINT settlement_void_fields_consistent
  CHECK ( ("status" = 'SETTLED'
             AND "voided_at" IS NULL AND "void_reason" IS NULL AND "voided_by_user_id" IS NULL)
       OR ("status" = 'VOIDED'
             AND "voided_at" IS NOT NULL AND "void_reason" IS NOT NULL
             AND "voided_by_user_id" IS NOT NULL) );

ALTER TABLE "driver_settlements" ADD CONSTRAINT settlement_period_ordered
  CHECK ("period_start" IS NULL OR "period_start" < "period_end");

-- 5. The sweep's hot path ----------------------------------------------------
-- "What has this driver delivered that nobody has collected on yet." Runs on
-- every preview, on every settle, and on the driver's own "what do I owe"
-- screen. PARTIAL on purpose: Prisma ignores partial indexes, so it will not
-- emit a DROP for this on the next migrate (see 20260831180000_hot_path_indexes).
-- Note orders.delivered_at had no index at all before this.
CREATE INDEX IF NOT EXISTS orders_unsettled_by_driver_idx
  ON "orders" ("driver_id", "currency", "delivered_at")
  WHERE "status" = 'DELIVERED' AND "settlement_id" IS NULL;

-- 6. Human-facing settlement number -----------------------------------------
-- Mirrors order_number_seq: STL-2026-000123. Without this the settle endpoint
-- fails outright, which is exactly the state production was left in.
CREATE SEQUENCE IF NOT EXISTS settlement_number_seq;

-- 7. Settled records are append-only ------------------------------------------
-- A mistake is corrected by VOIDING the settlement, never by editing what was
-- recorded. forbid_history_mutation() already exists for order_status_history
-- but names that table in its message, so this is its sibling.
CREATE OR REPLACE FUNCTION forbid_settlement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'settlement records are append-only; void the settlement instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settlement_lines_immutable
  BEFORE UPDATE OR DELETE ON "driver_settlement_lines"
  FOR EACH ROW EXECUTE FUNCTION forbid_settlement_mutation();

CREATE TRIGGER settlement_adjustments_immutable
  BEFORE UPDATE OR DELETE ON "settlement_adjustments"
  FOR EACH ROW EXECUTE FUNCTION forbid_settlement_mutation();

-- A settlement row itself stays updatable — that is how a void is recorded —
-- but it may never be deleted.
CREATE OR REPLACE FUNCTION forbid_settlement_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'settlements are never deleted; void the settlement instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settlements_undeletable
  BEFORE DELETE ON "driver_settlements"
  FOR EACH ROW EXECUTE FUNCTION forbid_settlement_delete();
