-- ---------------------------------------------------------------------------
-- Hand-written database guards. These back the application state machine at
-- the storage layer: even a buggy code path cannot violate them.
-- ---------------------------------------------------------------------------

-- 1. Financial invariants -----------------------------------------------------
ALTER TABLE "orders" ADD CONSTRAINT order_charge_nonneg
  CHECK ("delivery_charge" >= 0);

ALTER TABLE "orders" ADD CONSTRAINT order_bps_range
  CHECK ("commission_bps" IS NULL OR ("commission_bps" BETWEEN 0 AND 10000));

ALTER TABLE "orders" ADD CONSTRAINT order_amounts_nonneg
  CHECK (("platform_commission_amount" IS NULL OR "platform_commission_amount" >= 0)
     AND ("driver_earnings" IS NULL OR "driver_earnings" >= 0));

-- Snapshot fields are all-null or all-set, and the split is exact.
ALTER TABLE "orders" ADD CONSTRAINT order_financial_snapshot_consistent
  CHECK (
    ("commission_bps" IS NULL AND "platform_commission_amount" IS NULL AND "driver_earnings" IS NULL)
    OR ("commission_bps" IS NOT NULL AND "platform_commission_amount" IS NOT NULL
        AND "driver_earnings" IS NOT NULL
        AND "platform_commission_amount" + "driver_earnings" = "delivery_charge")
  );

-- 2. Status/driver coupling ---------------------------------------------------
ALTER TABLE "orders" ADD CONSTRAINT order_status_driver_coupling
  CHECK (
    ("status" = 'PENDING' AND "driver_id" IS NULL AND "commission_bps" IS NULL)
    OR ("status" IN ('DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED')
        AND "driver_id" IS NOT NULL AND "commission_bps" IS NOT NULL)
    OR ("status" = 'CANCELLED') -- may or may not carry a driver (pre/post assignment)
  );

-- 3. Lifecycle timestamp sanity -----------------------------------------------
ALTER TABLE "orders" ADD CONSTRAINT order_ts_ordering
  CHECK (("picked_up_at" IS NULL OR "assigned_at" IS NOT NULL)
     AND ("delivered_at" IS NULL OR "picked_up_at" IS NOT NULL));

-- 4. Phone shape (belt-and-suspenders behind app normalization) ----------------
ALTER TABLE "users" ADD CONSTRAINT user_phone_e164_lb
  CHECK ("normalized_phone" ~ '^\+961[0-9]{7,8}$');

ALTER TABLE "drivers" ADD CONSTRAINT driver_contact_phone_e164_lb
  CHECK ("contact_phone" ~ '^\+961[0-9]{7,8}$');

ALTER TABLE "customers" ADD CONSTRAINT customer_phone_e164_lb
  CHECK ("normalized_phone" ~ '^\+961[0-9]{7,8}$');

-- 5. Commission configuration ranges ------------------------------------------
ALTER TABLE "drivers" ADD CONSTRAINT driver_override_bps_range
  CHECK ("commission_override_bps" IS NULL OR ("commission_override_bps" BETWEEN 0 AND 10000));

ALTER TABLE "platform_settings" ADD CONSTRAINT platform_default_bps_range
  CHECK ("default_commission_bps" BETWEEN 0 AND 10000);

-- 6. Hot partial index for the available-orders feed ---------------------------
CREATE INDEX order_available_feed_idx
  ON "orders" ("created_at") WHERE "status" = 'PENDING';

-- 7. order_status_history is append-only ---------------------------------------
CREATE OR REPLACE FUNCTION forbid_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'order_status_history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_status_history_immutable
  BEFORE UPDATE OR DELETE ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

-- 8. Human-facing order number sequence ----------------------------------------
CREATE SEQUENCE order_number_seq;

-- 9. Seed the settings singleton so reads never race a missing row -------------
INSERT INTO "platform_settings" ("id", "default_commission_bps", "settings", "updated_at")
VALUES ('singleton', 3000, '{}', NOW())
ON CONFLICT ("id") DO NOTHING;
