# Loadless Delivery Platform

Multi-vendor delivery management platform (Lebanon). Three roles: ADMIN / VENDOR / DRIVER.
Full architecture plan: `~/.claude/plans/delivery-platform-squishy-wall.md`.

## Stack & layout

- pnpm workspaces monorepo: `apps/web` (Next.js 15 App Router), `apps/api` (NestJS 11 + Prisma 6 + Socket.IO), `packages/shared` (pure TS contracts).
- Postgres 16 + Redis 7 via `docker-compose.dev.yml` (apps run natively: `pnpm dev`).
- Dev ports: web **3100**, api **4100** (4000/3000-3003 belong to other projects on this machine).
- `packages/shared` is the single source of truth for enums, zod DTO schemas, socket event contracts, phone normalization, money helpers. It must stay pure (no Nest/Prisma/React imports — ESLint-enforced). It compiles to CJS (`pnpm --filter @loadless/shared build`); rebuild after editing it (or run its `dev` watcher).

## Non-negotiable invariants

- **Money**: BigInt integer minor units + currency (LBP exponent 0, USD exponent 2). Commission in basis points. `calcCommission` in shared is the ONLY commission math. Earnings = charge − commission (never computed independently). BigInt serializes as strings on the wire (global interceptor).
- **Financial snapshot** (commissionBps + amounts) is computed atomically at driver ACCEPTANCE (per-driver rate: `commissionOverrideBps ?? platform default`), cleared on release, recomputed on admin reassign. Never at order creation.
- **Concurrency**: all order transitions are conditional atomic `updateMany` with the full guard in the WHERE clause (status + driverId + ownership), inside a transaction that also writes `order_status_history`. `count === 0` ⇒ 409 with a stable code. Never fetch-then-update. Socket events emit only AFTER commit.
- **State machine**: transition table lives in `packages/shared/src/order-transitions.ts`. Vendor cancels ONLY while PENDING. Driver release only before pickup. DB CHECK constraints back all of this (see `constraints_and_guards` migration).
- **Phones**: normalize via shared `normalizeLebanesePhone` everywhere; stored as `+961…`; DB CHECK regex backstops it.
- **Locations are Google Maps LINKS, not map pins** (product decision): the customer shares a maps link on WhatsApp, the vendor pastes it (`Order.deliveryMapsUrl`, `CustomerAddress.mapsUrl`), the driver taps Navigate to open it. There is NO map-picker UI and no Leaflet dependency; lat/lng columns exist but are unused v1.
- **Admin manages everything**: customers (name + identity phone — phone change is admin-only — plus address book) via `/admin/customers/:id`; drivers/vendors CRUD; orders assign/reassign/cancel.
- **Login identity is split by role** (product decision): DRIVERS sign in with phone + password; ADMINS and VENDORS sign in with email + password. `users.email` / `users.normalized_phone` are nullable uniques with a role-identity DB CHECK. One login form accepts both (anything with "@" = email).
- **Sessions are permanent** (product decision): one login per device, never auto-expired — 400-day sliding refresh window, re-extended on every use. Sessions end only on explicit sign-out, admin suspension/password change, or refresh-token theft detection. Never add idle timeouts or forced re-login.
- **Authorization**: ownership via query scoping (`vendorId: user.vendorId` in the WHERE), never fetch-then-compare; foreign resources are 404. No scattered `role === 'ADMIN'` — use PolicyService.
- **Prisma custom SQL** (CHECKs, partial indexes, triggers, sequences) goes in hand-edited migrations via `prisma migrate dev --create-only`.

## API conventions

- Base path `/api/v1`. Success `{ data, meta? }`; errors `{ error: { code, message, details?, requestId } }` with codes from shared `ERROR_CODES`. Validation via `ZodValidationPipe` + shared schemas (NOT class-validator).
- Domain errors are `AppException` only.
- Redis caching allowlist ONLY: analytics aggregates (short TTL), platform settings (invalidate on update), throttler/deactivation state. Order data is NEVER cached.

## Workflow

- `docker compose -f docker-compose.dev.yml up -d` then `pnpm dev`. Dev accounts: admin `admin@gmail.com`, vendor `vendor@gmail.com`, driver `70 123 456` — all password `loadless`.
- Verify with `pnpm -r lint && pnpm -r typecheck && pnpm -r test` before finishing any task. Integration: `pnpm --filter @loadless/api test:integration`. Browser e2e: `bash apps/web/e2e/prepare.sh && (cd apps/web && pnpm e2e)` — 32 tests covering every flow; specs live in `apps/web/e2e/`.
- The reusable design system lives in the tokens in `apps/web/src/app/globals.css` (shadows, status colors, `surface-brand`); UI primitives in `src/components/ui/` are restyled on those tokens — never introduce raw hex in components.
- Migrations: run from `apps/api` with `DATABASE_URL` from `.env`.
- Deployment follows `~/playbooks/DEPLOY-PLAYBOOK.md` (Hostinger VPS, Caddy path-routing one hostname, only Caddy publishes ports).
