-- The admin settlements worklist ("who is holding the platform's money") sums
-- platform_commission_amount grouped by (driver_id, currency) over every
-- delivered-and-unsettled order.
--
-- orders_unsettled_by_driver_idx already had the right KEY columns, but not the
-- column being summed — so every matching row still needed a heap visit, and
-- once the unsettled set grew the planner abandoned the index for a sequential
-- scan of the whole orders table.
--
-- The comment on the original index assumed the unsettled set stays "a day's
-- work, because settling empties it". That is true while settling keeps up, and
-- false exactly when it does not — a backlog is precisely when the admin opens
-- this screen. Measured on the 400k-order perf database with 150k unsettled:
--   before  500 ms, Parallel Seq Scan on orders
--   after    17 ms, Parallel Index Only Scan, 130 heap fetches
--
-- INCLUDE rather than a second index: the predicate is already indexed, and a
-- duplicate partial index over the same rows would double the write cost on
-- orders, which is the hottest table here. The key columns are unchanged, so
-- the per-driver preview and "what do I owe" queries keep the same plan.
DROP INDEX IF EXISTS "orders_unsettled_by_driver_idx";

CREATE INDEX IF NOT EXISTS "orders_unsettled_by_driver_idx"
  ON "orders" ("driver_id", "currency", "delivered_at")
  INCLUDE ("platform_commission_amount")
  WHERE "status" = 'DELIVERED' AND "settlement_id" IS NULL;
