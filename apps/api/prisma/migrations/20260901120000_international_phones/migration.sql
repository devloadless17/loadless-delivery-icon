-- ---------------------------------------------------------------------------
-- Phones: Lebanon is the DEFAULT country, not the only one.
--
-- Plenty of customers live in Lebanon on a foreign number, and a CHECK that
-- rejects them rejects a real delivery. The constraints keep Lebanese numbers
-- strict — the prefixes are known, so a typo on the identity key is worth
-- catching — and accept any other country on E.164 shape alone.
--
-- Both halves matter: without the first, "+961999" would slip through as a
-- generic international number; without the second, a customer in Lebanon on a
-- UAE number could not be saved at all.
-- ---------------------------------------------------------------------------

-- Lebanese: +961 then 7 or 8 national digits. Anything else: +, a non-zero
-- country digit, then 7 to 14 more (E.164 caps the whole number at 15).
CREATE OR REPLACE FUNCTION is_valid_phone(p TEXT) RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN p LIKE '+961%' THEN p ~ '^\+961[0-9]{7,8}$'
    ELSE p ~ '^\+[1-9][0-9]{7,14}$'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- The old names carry an "_lb" suffix that is no longer true.
ALTER TABLE "customers" DROP CONSTRAINT customer_phone_e164_lb;
ALTER TABLE "customers"
  ADD CONSTRAINT customer_phone_e164 CHECK (is_valid_phone("normalized_phone"));

ALTER TABLE "drivers" DROP CONSTRAINT driver_contact_phone_e164_lb;
ALTER TABLE "drivers"
  ADD CONSTRAINT driver_contact_phone_e164 CHECK (is_valid_phone("contact_phone"));

ALTER TABLE "users" DROP CONSTRAINT user_phone_e164_lb;
ALTER TABLE "users"
  ADD CONSTRAINT user_phone_e164
  CHECK ("normalized_phone" IS NULL OR is_valid_phone("normalized_phone"));
