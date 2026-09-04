-- The platform must always keep at least one admin who can sign in.
--
-- Until now nothing enforced that: no CHECK, no trigger, no service guard. A
-- plain `DELETE FROM users WHERE role='ADMIN'` — or setting the last one
-- is_active=false — locks every operator out of the console, and the only way
-- back in is running bootstrap-admin against a database with no admin at all.
-- Now that admins can delete and suspend each other from the UI, that stops
-- being hypothetical.
--
-- This trigger is the BACKSTOP, not the whole guard. It catches psql, scripts,
-- and any future code path that never goes through AdminsService. What it
-- cannot do is serialise two concurrent requests: each transaction sees its own
-- snapshot, so two admins deleting each other at the same moment would both
-- pass this check and both commit. That case is handled in the service, which
-- locks the admin set with SELECT … FOR UPDATE before counting. Both halves are
-- needed; neither is sufficient.
--
-- AFTER, not BEFORE: the count has to see the row already gone (or already
-- deactivated), and an AFTER trigger that raises still rolls the statement back.
CREATE OR REPLACE FUNCTION keep_one_active_admin() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "users" WHERE "role" = 'ADMIN' AND "is_active" = true
  ) THEN
    RAISE EXCEPTION 'the platform must keep at least one active admin';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- WHEN (OLD.role = 'ADMIN') so the count never runs for a vendor or driver
-- write — this table is on the login path and is written on every failed
-- attempt (failed_logins, locked_until).
CREATE TRIGGER users_keep_one_active_admin
  AFTER DELETE OR UPDATE ON "users"
  FOR EACH ROW
  WHEN (OLD."role" = 'ADMIN')
  EXECUTE FUNCTION keep_one_active_admin();
