-- ---------------------------------------------------------------------------
-- A Google Maps link on its own is a complete location.
--
-- Customers here share a pin on WhatsApp far more often than they recite a
-- street address, and the driver navigates by the link either way. Requiring
-- typed text forced the vendor to invent an address; now either one suffices
-- (application-level: at least one of the two must be present).
-- ---------------------------------------------------------------------------
ALTER TABLE "customer_addresses" ALTER COLUMN "address_text" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "delivery_address_text" DROP NOT NULL;

-- The existing dedupe index keys on the normalized text; a NULL text is
-- distinct in a unique index, so link-only addresses need their own guard or
-- two identical pins could both be saved in a race.
CREATE UNIQUE INDEX "customer_address_maps_dedupe_uniq"
  ON "customer_addresses" ("customer_id", "maps_url")
  WHERE "is_archived" = false AND "maps_url" IS NOT NULL;
