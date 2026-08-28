-- Locations travel as Google Maps links (customer -> vendor -> driver).
ALTER TABLE "customer_addresses" ADD COLUMN "maps_url" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_maps_url" TEXT;
