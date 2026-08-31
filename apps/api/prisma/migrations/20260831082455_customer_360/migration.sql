-- ---------------------------------------------------------------------------
-- Customer 360: per-customer history + a real dedupe guarantee for addresses.
-- ---------------------------------------------------------------------------

-- 1. The vendor-scoped slice of one customer's orders is the hottest read in
--    the vendor UI (it fires on every phone lookup, mid-call). With this the
--    slice is a contiguous range already ordered by created_at — no heap
--    filter, no sort node.
CREATE INDEX "orders_customer_id_vendor_id_created_at_idx"
  ON "orders" ("customer_id", "vendor_id", "created_at");

-- 2. Backfill: before collapsing duplicate addresses, let a surviving row
--    inherit any Google Maps link its duplicates carry. Losing a link the
--    driver navigates by would be a real regression.
UPDATE "customer_addresses" a
SET "maps_url" = d."maps_url"
FROM "customer_addresses" d
WHERE a."maps_url" IS NULL
  AND d."maps_url" IS NOT NULL
  AND d."id" <> a."id"
  AND d."customer_id" = a."customer_id"
  AND d."is_archived" = false AND a."is_archived" = false
  AND lower(btrim(regexp_replace(d."address_text", '\s+', ' ', 'g')))
    = lower(btrim(regexp_replace(a."address_text", '\s+', ' ', 'g')));

-- 3. Archive pre-existing duplicates, keeping the OLDEST row per (customer,
--    normalized address). Nothing is deleted — orders carry their own frozen
--    address snapshot, so history is unaffected.
UPDATE "customer_addresses" a
SET "is_archived" = true
WHERE a."is_archived" = false
  AND EXISTS (
    SELECT 1 FROM "customer_addresses" b
    WHERE b."customer_id" = a."customer_id"
      AND b."is_archived" = false
      AND lower(btrim(regexp_replace(b."address_text", '\s+', ' ', 'g')))
        = lower(btrim(regexp_replace(a."address_text", '\s+', ' ', 'g')))
      AND (b."created_at" < a."created_at"
           OR (b."created_at" = a."created_at" AND b."id" < a."id"))
  );

-- 4. The backstop. Application-level dedupe cannot survive two concurrent
--    orders for the same customer+address; a unique index can. Partial, so an
--    archived row never blocks a legitimate re-add. The expression MUST stay
--    in step with normalizeAddressKey() in packages/shared/src/address.ts.
CREATE UNIQUE INDEX "customer_address_dedupe_uniq"
  ON "customer_addresses" ("customer_id", (lower(btrim(regexp_replace("address_text", '\s+', ' ', 'g')))))
  WHERE "is_archived" = false;
