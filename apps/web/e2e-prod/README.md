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

## STOP — this suite WRITES to production

It creates vendors, drivers, customers, orders and settlements, and records real
handovers. That was right while the platform was being commissioned and empty.
It is **wrong once real trade is running**: the same run puts fabricated
deliveries and fabricated money alongside a real business's books, and the
platform has been live to real users since 2026-09-03.

Before running it, answer one question: **does production have real data in it?**
If yes, or if you are not sure, do not run this. Point it at a staging
deployment with `PROD_BASE_URL` instead.

## Running it

```bash
PROD_ADMIN_PASSWORD='…' \
PRODCHECK_I_UNDERSTAND_THIS_WRITES_REAL_DATA=yes \
pnpm --filter @loadless/web exec playwright test --config e2e-prod/playwright.config.ts
```

Both variables are required. Without the password it will not guess credentials;
without the consent phrase it refuses to write to a live system. The phrase is
deliberately long so it cannot be set by reflex or left lying in a shell.
`PROD_BASE_URL` overrides the target (default `https://flashdelivery.ink`).

Read a failure as a production failure: there are no fixtures and no reset here.

## Cleaning up

Everything created is stamped. The targeted cleanup removes exactly those rows
and nothing else — see the `prod-cleanup.sql` used alongside this suite. A full
production wipe makes it redundant.
