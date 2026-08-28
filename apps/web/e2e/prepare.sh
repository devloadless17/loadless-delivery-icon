#!/usr/bin/env bash
# Prepares the e2e stack: e2e database (migrated + seeded) and both app builds.
set -euo pipefail
cd "$(dirname "$0")/../../.."

E2E_DB_URL="${E2E_DATABASE_URL:-postgresql://loadless:loadless@localhost:5432/loadless_e2e?schema=public}"
DB_NAME=$(basename "${E2E_DB_URL%%\?*}")

docker exec loadless-postgres createdb -U loadless "$DB_NAME" 2>/dev/null || true

pnpm --filter @loadless/shared build
(cd apps/api && DATABASE_URL="$E2E_DB_URL" npx prisma migrate deploy && pnpm build \
  && DATABASE_URL="$E2E_DB_URL" node dist/scripts/seed-e2e.js)
# Rewrites are baked at BUILD time — the e2e build must point at the e2e API port.
API_ORIGIN="http://localhost:4190" pnpm --filter @loadless/web build
echo "e2e stack prepared"
