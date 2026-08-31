-- ---------------------------------------------------------------------------
-- Hot-path indexes.
--
-- Measured against a 400k-order / 120k-customer database, not guessed. Every
-- index below replaces a sequential scan or a top-N sort on a screen someone
-- looks at all day:
--
--   vendor "All orders" (their home screen)   33.0ms -> 0.08ms
--   admin order list                          37.4ms -> 0.06ms
--   admin customer directory                  14.9ms -> 0.03ms
--   admin directory filtered by vendor        14.3ms -> 0.80ms
--   driver active deliveries                   4.5ms -> 0.29ms
--
-- The pattern behind all of them: an index can only supply ORDER BY if the
-- ordering columns follow the equality columns with nothing in between. The
-- existing orders(vendor_id, status, created_at) has `status` in the middle,
-- so the UNFILTERED vendor list — the default tab — could not use it for
-- ordering and read every one of that vendor's orders instead.
-- ---------------------------------------------------------------------------

-- Superseded by the same index plus created_at, which serves the ordering too.
DROP INDEX "orders_driver_id_status_idx";

CREATE INDEX "orders_vendor_id_created_at_id_idx"
  ON "orders"("vendor_id", "created_at" DESC, "id" DESC);
CREATE INDEX "orders_driver_id_status_created_at_idx"
  ON "orders"("driver_id", "status", "created_at" DESC);
CREATE INDEX "orders_created_at_id_idx"
  ON "orders"("created_at" DESC, "id" DESC);
CREATE INDEX "customers_created_at_idx"
  ON "customers"("created_at" DESC);

-- ---------------------------------------------------------------------------
-- Name search.
--
-- Searching a name is `ILIKE '%typed%'` — a leading wildcard, which no btree
-- can serve. Admin searches the WHOLE directory by name, so without a trigram
-- index that is a sequential scan of every customer on every keystroke
-- (measured: 120k-row seq scan -> 4.5ms bitmap scan with this index).
--
-- pg_trgm is a trusted extension on PG13+, so this needs no superuser.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The WHERE is always true ("name" is NOT NULL), so the index still covers
-- every row and the planner uses it freely. It is there because Prisma cannot
-- model a GIN index: without a predicate it reads this as an ordinary index on
-- (name) that its datamodel lacks, and every future `migrate dev` would emit a
-- DROP for it. Prisma skips PARTIAL indexes, which is how the other raw
-- indexes in this schema already stay invisible to it.
CREATE INDEX "customers_name_trgm_idx"
  ON "customers" USING gin ("name" gin_trgm_ops)
  WHERE "name" IS NOT NULL;

-- Partial: almost every link follows the global name, so the index only needs
-- the handful of rows that actually carry a private alias.
CREATE INDEX "customer_vendors_display_name_trgm_idx"
  ON "customer_vendors" USING gin ("display_name" gin_trgm_ops)
  WHERE "display_name" IS NOT NULL;
