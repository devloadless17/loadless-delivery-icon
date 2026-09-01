-- Drop orders.notes.
--
-- It was write-only for the person who wrote it: the vendor typed a note
-- labelled "only your team and the platform see this", and no vendor screen
-- ever rendered it back. The single reader was the admin order detail. A field
-- you can write and never read is not a feature, it is a place for information
-- to go and be lost — the useful sibling is `delivery_instructions`, which the
-- driver actually sees.
ALTER TABLE "orders" DROP COLUMN "notes";
