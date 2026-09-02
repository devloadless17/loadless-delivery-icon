# Production verification

A SEPARATE Playwright suite that drives the real deployment. It exists because
the main `e2e/` suite must never be pointed at production:

- `e2e/prepare.sh` **drops and recreates** its database.
- `02-admin` mutates the real platform commission — the number every future
  order's snapshot is computed from.
- The deletion specs remove vendors and drivers.

None of that is survivable against live data, and a planned wipe afterwards does
not make it safe beforehand: a wipe is a decision, a destructive test run is an
accident that resembles one.

## Rules this suite follows

- Starts **no** web server and touches **no** database directly — it drives
  HTTPS like a person would.
- Creates only records stamped `PRODCHECK-<run>`, so everything it makes can be
  found and removed.
- **Never** opens platform settings. Nudging the commission and putting it back
  still mis-prices anything created in between.
- Reads pre-existing data but modifies none of it.

## Running it

```bash
PROD_ADMIN_PASSWORD='…' pnpm --filter @loadless/web exec \
  playwright test --config e2e-prod/playwright.config.ts
```

Without `PROD_ADMIN_PASSWORD` every test skips rather than guessing credentials.
`PROD_BASE_URL` overrides the target (default `https://flashdelivery.loadless.site`).

Read a failure as a production failure: there are no fixtures and no reset here.

## Cleaning up

Everything created is stamped. The targeted cleanup removes exactly those rows
and nothing else — see the `prod-cleanup.sql` used alongside this suite. A full
production wipe makes it redundant.
