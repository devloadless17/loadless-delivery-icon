# Deployment

Single Hostinger VPS, Docker Hub images, GitHub Actions. One hostname, path-routed
by Caddy (the only service publishing host ports): `/` → web, `/api/*` and
`/socket.io/*` → api. Pushing the **`production`** branch deploys (after all checks);
`main` and PRs only run checks. Redeploy/rollback without a commit via
*Actions → CI → Run workflow* on `production`.

## GitHub secrets

Infra (fixed names — same across all projects):

| Secret | Value |
|---|---|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_SECRET` | Docker Hub access token |
| `VPS_HOST` | server IP |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY_B64` | `base64 -w0 ~/.ssh/loadless_deploy \| clip.exe` |
| `VPS_PORT` | optional, defaults 22 |
| `FRONTEND_DOMAIN` | bare hostname, no `https://` (e.g. `app.loadless.ai`) — the ONLY domain; the API is path-routed under it |
| `ACME_EMAIL` | real email — Let's Encrypt expiry notices |

App-specific:

| Secret | What | How to generate |
|---|---|---|
| `JWT_SECRET` | access-token signing key (≥32 chars) | `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | database password | `openssl rand -base64 48` |
| `R2_ACCOUNT_ID` | Cloudflare account id | Cloudflare dashboard → R2 |
| `R2_ACCESS_KEY_ID` | R2 API token key id | R2 → Manage API Tokens (Object Read & Write, scoped to the bucket) |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret | same token screen |
| `R2_BUCKET` | bucket name (private; e.g. `loadless-uploads`) | create in R2 first |

`API_DOMAIN` is intentionally not used — realtime (Socket.IO) requires the socket to
share the frontend hostname, so everything lives under `FRONTEND_DOMAIN`.

## One-time setup

1. **Server baseline**: playbook §2 (patch, swap, docker+log rotation, `deploy` user,
   UFW 22/80/443, fail2ban). Remember: only Caddy publishes ports — that compose rule,
   not UFW, is the container security boundary.
2. **SSH**: playbook §3 — authorize Ali's key + a per-project CI key
   (`ssh-keygen -t ed25519 -f ~/.ssh/loadless_deploy -N "" -C "github-actions-loadless"`).
3. **DNS**: `FRONTEND_DOMAIN` A-record → VPS IP.
4. **R2**: create the private bucket + scoped API token.
5. Create all secrets above, then push `production`.

## First boot (after the first successful deploy)

Create the first admin (email + password — admins/vendors log in with email,
drivers with phone):

```bash
ssh deploy@<ip>
cd ~/loadless
docker compose -f docker-compose.prod.yml run --rm \
  -e ADMIN_EMAIL='you@example.com' -e ADMIN_PASSWORD='<strong password>' \
  api node dist/scripts/bootstrap-admin.js </dev/null
```

Then in the deployed browser: **log in → hard refresh → perform a write** (create a
vendor). That check catches split-host/cookie problems local testing cannot (playbook §9d).

## HTTP/3

`docker-compose.prod.yml` publishes TCP 443 only. Before enabling UDP: run the
playbook §7 measurement; if UDP/443 is delivered, uncomment `443:443/udp` AND leave
Caddy defaults. If not, keep it commented — never mismatch the two sides.

## Rollback

```bash
ssh deploy@<ip> 'cd ~/loadless && sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='"'"'<previous sha>'"'"'/" .env \
  && docker compose -f docker-compose.prod.yml up -d'
```

Previous SHAs are the image tags on Docker Hub / the commit list on `production`.

## Backups (activate when the app is live with real data — deliberate, playbook §10)

```bash
# nightly cron on the VPS; upload the dump OFFSITE (rclone → R2/B2)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U loadless -Fc loadless | gzip > backup-$(date +%F).dump.gz

# restore test (scratch container):
gunzip -c backup-<date>.dump.gz | docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U loadless -d loadless_restore_test --clean --create
```

Retention 7 daily + 4 weekly. A backup that has never been restore-tested does not
exist. The `caddy_data` volume (TLS certs) is precious too. **Before every schema
migration on live money data: take a backup first.**

## Local development

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + redis
cp apps/api/.env.example apps/api/.env           # then set JWT_SECRET
pnpm install && pnpm --filter @loadless/shared build
cd apps/api && pnpm prisma:deploy                # apply migrations
ADMIN_EMAIL=admin@loadless.dev ADMIN_PASSWORD=devadmin123 node dist/scripts/bootstrap-admin.js
pnpm dev                                         # web :3100, api :4100
```
