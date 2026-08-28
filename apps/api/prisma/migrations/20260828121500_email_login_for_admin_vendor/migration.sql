-- Login identity split by role: DRIVER -> phone, ADMIN/VENDOR -> email.

ALTER TABLE "users" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

ALTER TABLE "users" ALTER COLUMN "normalized_phone" DROP NOT NULL;

-- Phone shape check must now tolerate NULL.
ALTER TABLE "users" DROP CONSTRAINT "user_phone_e164_lb";
ALTER TABLE "users" ADD CONSTRAINT user_phone_e164_lb
  CHECK ("normalized_phone" IS NULL OR "normalized_phone" ~ '^\+961[0-9]{7,8}$');

-- Basic email shape backstop (app validates properly).
ALTER TABLE "users" ADD CONSTRAINT user_email_shape
  CHECK ("email" IS NULL OR "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Backfill for pre-existing admin/vendor rows (pre-release safety net): they get
-- a placeholder login that an admin replaces; drivers keep their phones.
UPDATE "users" SET "email" = CONCAT("id", '@replace.me')
WHERE "role" IN ('ADMIN', 'VENDOR') AND "email" IS NULL;

-- The role decides which identity is required.
ALTER TABLE "users" ADD CONSTRAINT user_identity_by_role
  CHECK (
    ("role" = 'DRIVER' AND "normalized_phone" IS NOT NULL)
    OR ("role" IN ('ADMIN', 'VENDOR') AND "email" IS NOT NULL)
  );
