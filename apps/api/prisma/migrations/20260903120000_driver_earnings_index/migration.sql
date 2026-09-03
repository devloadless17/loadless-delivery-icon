-- The driver's Earnings screen sums DELIVERED orders by delivered_at ("today",
-- "last 7 days"). The only index with driver_id is
-- orders(driver_id, status, created_at DESC) — it orders by CREATED_AT, so the
-- date range could not be satisfied from the index: Postgres read every one of
-- that driver's delivered orders and filtered the rest away.
--
-- Measured on the 400k-order perf database, a driver with 3,334 deliveries:
--   before  635 ms cold / 6.6 ms warm, 2,628 of 3,333 rows discarded by filter
--   after   2.5 ms, nothing discarded
-- The cost grew with the driver's LIFETIME volume, so it degrades as he works;
-- with this index it tracks the size of the window he is actually looking at.
--
-- Partial (DELIVERED only) because that is the sole status the earnings and
-- settlement sums ever ask for, which keeps it small next to the full table.
--
-- Plain CREATE INDEX, not CONCURRENTLY: Prisma runs each migration inside a
-- transaction and CONCURRENTLY cannot run in one. That is safe while orders is
-- small; on a large live table this should instead be applied out-of-band with
-- CREATE INDEX CONCURRENTLY before the release that needs it.
CREATE INDEX IF NOT EXISTS orders_driver_delivered_at_idx
  ON "orders" ("driver_id", "delivered_at" DESC)
  WHERE "status" = 'DELIVERED';
