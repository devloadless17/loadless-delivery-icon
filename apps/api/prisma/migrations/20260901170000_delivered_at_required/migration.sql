-- A DELIVERED order must carry the moment it was delivered.
--
-- This closes a silent money leak in the settlement sweep. The sweep selects
-- unsettled deliveries with `delivered_at <= cutoff`, and SQL comparisons
-- against NULL are never true — so a DELIVERED row with a NULL delivered_at
-- would be invisible to every settlement, forever. The platform's commission
-- on it would never be collected and nothing would report it missing.
--
-- The application always sets the timestamp on the deliver transition, so this
-- is not fixing a bug in today's code; it is making the sweep's precondition
-- structural, so a future script, backfill or fixture cannot quietly create an
-- uncollectable delivery. order_ts_ordering already enforced the reverse
-- direction (delivered_at implies picked_up_at) but never required the
-- timestamp itself.
--
-- Verified zero violating rows in development and production before adding.
ALTER TABLE "orders" ADD CONSTRAINT order_delivered_has_timestamp
  CHECK ("status" <> 'DELIVERED' OR "delivered_at" IS NOT NULL);
