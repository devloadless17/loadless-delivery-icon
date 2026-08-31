-- ---------------------------------------------------------------------------
-- The vendor <-> customer relationship
--
-- Customers stay GLOBAL (one row per phone, shared by every vendor). What was
-- missing is the relationship: which vendors actually deal with this customer.
-- That single fact answers three product asks at once:
--
--   1. "my customers"  -> a bounded, sortable, searchable list per vendor
--   2. a PRIVATE name  -> each vendor may label a customer their own way
--   3. admin visibility-> who added them, and who else serves them
--
-- It is also the security boundary. Without it, a name search over customers
-- would be a global directory of every shop's clientele.
-- ---------------------------------------------------------------------------

CREATE TABLE "customer_vendors" (
    "customer_id"      TEXT NOT NULL,
    "vendor_id"        TEXT NOT NULL,
    -- This vendor's private name for the customer. NULL = follow customers.name.
    "display_name"     TEXT,
    -- Denormalized by the trigger below: the list pages off an index instead
    -- of aggregating orders per row.
    "orders_count"     INTEGER NOT NULL DEFAULT 0,
    "last_order_at"    TIMESTAMP(3),
    -- Sort key. NOT NULL so the index scan never needs a Sort node.
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_vendors_pkey" PRIMARY KEY ("customer_id", "vendor_id")
);

ALTER TABLE "customer_vendors"
  ADD CONSTRAINT "customer_vendors_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_vendors_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A counter can only ever grow (a cancelled order still happened).
ALTER TABLE "customer_vendors"
  ADD CONSTRAINT "customer_vendors_orders_count_nonneg" CHECK ("orders_count" >= 0);
-- An empty alias is a NULL alias: "" would render as a blank name.
ALTER TABLE "customer_vendors"
  ADD CONSTRAINT "customer_vendors_display_name_not_blank"
  CHECK ("display_name" IS NULL OR btrim("display_name") <> '');

-- THE list index. Equality on vendor_id, then an already-sorted range:
-- Index Scan, no Sort, LIMIT terminates early. customer_id is the tiebreak so
-- pagination is deterministic when two links share a timestamp.
CREATE INDEX "customer_vendors_vendor_activity_idx"
  ON "customer_vendors" ("vendor_id", "last_activity_at" DESC, "customer_id" DESC);

-- ---------------------------------------------------------------------------
-- Maintenance triggers.
--
-- App code would be the obvious place, and it is the wrong one: "an order
-- exists" IMPLIES "a relationship exists", so the link must be written inside
-- the order's own transaction no matter who inserted the order — the service,
-- a backfill script, or a test fixture using prisma.order.create. A trigger is
-- the only place that holds for all three. ON CONFLICT makes it race-safe when
-- two vendors order for the same customer at the same instant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION link_customer_vendor_on_order() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "customer_vendors" (
    "customer_id", "vendor_id", "orders_count", "last_order_at", "last_activity_at",
    "created_at", "updated_at"
  )
  VALUES (NEW."customer_id", NEW."vendor_id", 1, NEW."created_at", NEW."created_at",
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("customer_id", "vendor_id") DO UPDATE SET
    "orders_count"     = "customer_vendors"."orders_count" + 1,
    -- GREATEST, not assignment: a backdated insert must not rewind the row.
    "last_order_at"    = GREATEST(COALESCE("customer_vendors"."last_order_at", NEW."created_at"),
                                  NEW."created_at"),
    "last_activity_at" = GREATEST("customer_vendors"."last_activity_at", NEW."created_at"),
    "updated_at"       = CURRENT_TIMESTAMP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_link_customer_vendor
  AFTER INSERT ON "orders"
  FOR EACH ROW EXECUTE FUNCTION link_customer_vendor_on_order();

-- Creating a customer relates you to them too, before any order exists.
-- DO NOTHING: an order-created link is strictly richer than an empty one.
CREATE OR REPLACE FUNCTION link_customer_vendor_on_create() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."created_by_vendor_id" IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO "customer_vendors" (
    "customer_id", "vendor_id", "orders_count", "last_activity_at", "created_at", "updated_at"
  )
  VALUES (NEW."id", NEW."created_by_vendor_id", 0, NEW."created_at",
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("customer_id", "vendor_id") DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_link_creator
  AFTER INSERT ON "customers"
  FOR EACH ROW EXECUTE FUNCTION link_customer_vendor_on_create();

-- ---------------------------------------------------------------------------
-- Backfill: every relationship that already exists in the order history.
-- ---------------------------------------------------------------------------

INSERT INTO "customer_vendors" (
  "customer_id", "vendor_id", "orders_count", "last_order_at", "last_activity_at",
  "created_at", "updated_at"
)
SELECT o."customer_id",
       o."vendor_id",
       COUNT(*),
       MAX(o."created_at"),
       MAX(o."created_at"),
       MIN(o."created_at"),
       CURRENT_TIMESTAMP
FROM "orders" o
GROUP BY o."customer_id", o."vendor_id"
ON CONFLICT ("customer_id", "vendor_id") DO NOTHING;

-- ...and every "I added them" relationship that never produced an order.
INSERT INTO "customer_vendors" (
  "customer_id", "vendor_id", "orders_count", "last_activity_at", "created_at", "updated_at"
)
SELECT c."id", c."created_by_vendor_id", 0, c."created_at", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "customers" c
WHERE c."created_by_vendor_id" IS NOT NULL
ON CONFLICT ("customer_id", "vendor_id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Address ownership.
--
-- customer_addresses.created_by_vendor_id was loose attribution; it now decides
-- who may EDIT the row, so it needs a real FK. ON DELETE SET NULL, not CASCADE:
-- deleting a vendor must never delete a customer's address — it just becomes
-- platform-owned, which only an admin can then edit.
-- ---------------------------------------------------------------------------

CREATE INDEX "customer_addresses_created_by_vendor_id_idx"
  ON "customer_addresses" ("created_by_vendor_id");
CREATE INDEX "customers_created_by_vendor_id_idx"
  ON "customers" ("created_by_vendor_id");

-- Rows pointing at a vendor that no longer exists would break the FK; there is
-- no legitimate one, but a NULL is the correct value if there is.
UPDATE "customer_addresses" a
SET "created_by_vendor_id" = NULL
WHERE a."created_by_vendor_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "vendors" v WHERE v."id" = a."created_by_vendor_id");

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_created_by_vendor_id_fkey"
  FOREIGN KEY ("created_by_vendor_id") REFERENCES "vendors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill ownership for rows saved before it meant anything. Best evidence
-- first: the vendor who earliest delivered to this exact address. Otherwise
-- whoever created the customer. Otherwise NULL — platform-owned, and an admin
-- can hand it over.
UPDATE "customer_addresses" a
SET "created_by_vendor_id" = (
  SELECT o."vendor_id"
  FROM "orders" o
  WHERE o."customer_id" = a."customer_id"
    AND lower(btrim(regexp_replace(COALESCE(o."delivery_address_text", ''), '\s+', ' ', 'g')))
      = lower(btrim(regexp_replace(COALESCE(a."address_text", ''), '\s+', ' ', 'g')))
    AND COALESCE(a."address_text", '') <> ''
  ORDER BY o."created_at" ASC
  LIMIT 1
)
WHERE a."created_by_vendor_id" IS NULL;

UPDATE "customer_addresses" a
SET "created_by_vendor_id" = c."created_by_vendor_id"
FROM "customers" c
WHERE c."id" = a."customer_id"
  AND a."created_by_vendor_id" IS NULL
  AND c."created_by_vendor_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- OPS — repair the denormalized counters if they are ever suspected wrong
-- (they are written only by the trigger above, inside the order's own
-- transaction, so this should never be needed):
--
--   UPDATE customer_vendors cv SET
--     orders_count  = COALESCE(t.n, 0),
--     last_order_at = t.last_at,
--     last_activity_at = GREATEST(cv.created_at, COALESCE(t.last_at, cv.created_at))
--   FROM (SELECT customer_id, vendor_id, COUNT(*) n, MAX(created_at) last_at
--         FROM orders GROUP BY 1, 2) t
--   WHERE t.customer_id = cv.customer_id AND t.vendor_id = cv.vendor_id;
-- ---------------------------------------------------------------------------
