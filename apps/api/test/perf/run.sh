#!/usr/bin/env bash
# Load test against a realistic database: 25 vendors, 60 drivers, 120k
# customers, 400k orders, 168k vendor<->customer links.
#
#   bash apps/api/test/perf/run.sh              # saturation: 25 concurrent
#   CONC=1 TOTAL=40 bash apps/api/test/perf/run.sh   # what one user feels
#
# Rebuilds the perf database only when it is missing, so repeat runs are quick.
set -euo pipefail
cd "$(dirname "$0")/../../../.."

DB=loadless_perf
URL="postgresql://loadless:loadless@localhost:5432/$DB?schema=public"
PORT=4290
SECRET='perf-test-secret-at-least-32-characters-long'

if ! docker exec loadless-postgres psql -U loadless -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
  echo "seeding $DB (a few minutes, once)…"
  docker exec loadless-postgres createdb -U loadless "$DB"
  (cd apps/api && DATABASE_URL="$URL" npx prisma migrate deploy >/dev/null)
  docker cp apps/api/test/perf/seed.sql loadless-postgres:/tmp/seed.sql
  docker exec loadless-postgres psql -U loadless -d "$DB" -q -f /tmp/seed.sql
else
  (cd apps/api && DATABASE_URL="$URL" npx prisma migrate deploy >/dev/null)
fi

(cd apps/api && pnpm build >/dev/null)
NODE_ENV=production PORT=$PORT DATABASE_URL="$URL" REDIS_URL="redis://localhost:6379" \
  JWT_SECRET="$SECRET" APP_ORIGIN="http://localhost:3190" STORAGE_DRIVER=local \
  LOCAL_STORAGE_DIR=/tmp/perf-uploads THROTTLE_DISABLE=1 SOCKET_REDIS_ADAPTER=false \
  TRUSTED_PROXY_HOPS=0 node apps/api/dist/main.js >/tmp/loadless-perf-api.log 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

until curl -sf "http://127.0.0.1:$PORT/api/v1/health" >/dev/null; do sleep 1; done
node apps/api/test/perf/loadtest.mjs
