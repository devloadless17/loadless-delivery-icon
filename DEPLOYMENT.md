# Deployment

Single Hostinger VPS, Docker Hub images, GitHub Actions. One hostname, path-routed
by Caddy (the only service publishing host ports): `/` → web, `/api/*` and
`/socket.io/*` → api. Redeploy without a commit via *Actions → CI → Run workflow*
on `production`.

Release: **`git push origin main` → watch it go green → `git push origin main:production`**

That order is load-bearing. The full suite — lint, typecheck, migrations against a
clean database, unit tests and the browser e2e — runs on `main` and on PRs, and is
where a change is proved. `production` runs only lint+typecheck before building,
because a release is the identical commit and re-running the suite there just
re-proved the same SHA at ~6 minutes a deploy.

Nothing mechanically enforces the order: pushing `production` without `main`, or
while `main` is red, deploys untested code. The smoke job still catches a broken
image before the server is touched, but it cannot catch a logic regression.

## Live environment

| | |
|---|---|
| Host | `187.77.167.2` (Hostinger, `srv1853164`, Ubuntu 24.04) |
| Domain | `flashdelivery.loadless.site` |
| Deploy dir | `/home/deploy/loadless` |
| SSH | `ssh deploy@187.77.167.2` (Ali's key), `ssh root@187.77.167.2` for admin |

## GitHub secrets

Infra (fixed names — same across all projects):

| Secret | Value |
|---|---|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_SECRET` | Docker Hub access token |
| `VPS_HOST` | `187.77.167.2` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY_B64` | `base64 -w0 ~/.ssh/loadless_deploy \| clip.exe` |
| `VPS_PORT` | optional, defaults 22 |
| `FRONTEND_DOMAIN` | bare hostname, no `https://` — `flashdelivery.loadless.site`. The ONLY domain; the API is path-routed under it |
| `ACME_EMAIL` | real email — Let's Encrypt expiry notices |

App-specific:

| Secret | What | How to generate |
|---|---|---|
| `JWT_SECRET` | access-token signing key (≥32 chars) | `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | database password | `openssl rand -hex 32` — **hex, not base64**: it is interpolated raw into `DATABASE_URL`, and a `/` would terminate the URL authority |
| `SEED_ADMIN_EMAIL` | first admin's login email | e.g. `ali@loadless.ai` |
| `SEED_ADMIN_PASSWORD` | first admin's password (min 8 chars) | `openssl rand -base64 24` |

No R2 secrets: uploads are on the VPS disk (below). `API_DOMAIN` is intentionally unused —
realtime (Socket.IO) requires the socket to share the frontend hostname, so everything
lives under `FRONTEND_DOMAIN`.

> A secret containing a **single quote** fails the render step loudly rather than
> corrupting the `.env`. Regenerate it if that happens.

## Uploads are on the VPS disk — and that makes a volume load-bearing

`STORAGE_DRIVER=local` (CLAUDE.md product decision); the R2 adapter exists but stays
unused until volume demands it. The API writes to `/app/uploads`, which the Dockerfile
creates **inside the image** — destroyed and recreated on every deploy. The
`uploads_data` named volume in `docker-compose.prod.yml` is the only thing standing
between a redeploy and losing every driver photo and vendor logo.

Consequence: **`uploads_data` is real data.** When backups get set up (playbook §10),
it belongs in them next to Postgres — a `pg_dump` alone does not protect the photos.

## HTTP/3

Measured on this VPS on 2026-09-01 per playbook §7: a UDP datagram sent to 443 from
outside reached a container listening there, so Hostinger **delivers UDP/443 here**.
`docker-compose.prod.yml` therefore publishes `443:443/udp` and Caddy keeps its
defaults (which advertise `alt-svc: h3=":443"`). Both sides match.

If the UDP publish is ever removed, pin `servers { protocols h1 h2 }` in the Caddyfile
**in the same commit** — browsers cache alt-svc for up to 30 days, so a mismatch breaks
some clients intermittently while others load fine.

## One-time setup

1. **Server baseline**: playbook §2. Done on 2026-09-01 — patched, swap, docker +
   log rotation, `deploy` user in the docker group, UFW 22/80/443 + 443/udp, fail2ban.
   Remember: only Caddy publishes ports — that compose rule, not UFW, is the container
   security boundary.
2. **SSH**: playbook §3 — Ali's key + the per-project CI key
   (`ssh-keygen -t ed25519 -f ~/.ssh/loadless_deploy -N "" -C "github-actions-loadless"`),
   both authorized for `deploy`.
3. **DNS**: `flashdelivery.loadless.site` A-record → `187.77.167.2`. Done.
   Changing the domain is DNS first, then the secret: Caddy asks Let's Encrypt for
   a certificate on boot, and if the name still points elsewhere the challenge
   fails and the site is down on the new host AND no longer served on the old one.
   Note `*.loadless.site` has a wildcard A-record pointing at another box, so an
   unconfigured subdomain resolves somewhere real rather than failing — a stale
   resolver cache will show you that host's certificate, not ours.
4. Create the secrets above, then `git push origin main:production`.

## First admin

The deploy creates it automatically from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
`bootstrap-admin.js` is **idempotent** — if any ADMIN already exists it prints
"nothing to do" — so it runs on every deploy and a rebuilt database is never left
unreachable. It only ever creates the FIRST admin: changing the secret does not
change an existing admin's password, so rotate that in the app.

This is a dedicated bootstrap script reading credentials from env, not a seeded
fixture — playbook §9: never seed dev/e2e fixtures in production. The credentials
travel over ssh **stdin** and deliberately never enter the rendered `.env`, so the
long-running api container does not hold them in its environment.

To create it by hand instead:

```bash
ssh loadless
cd ~/loadless
docker compose -f docker-compose.prod.yml run --rm -T \
  -e ADMIN_EMAIL='you@example.com' -e ADMIN_PASSWORD='<strong password>' \
  api node dist/scripts/bootstrap-admin.js </dev/null
```

`-T` and `</dev/null` are both deliberate: `compose run` attaches and drains stdin.

### Verify in the DEPLOYED browser (playbook §9d)

Log in → **hard refresh** → perform a write (create a vendor). The refresh is the
load-bearing step: it discards what the app held in memory and forces it to re-derive
its credentials the way a cold visitor would. Run it after any change to the hosting
shape — new domain, a CDN in front, cookie settings touched.

## Rollback

Every healthy deploy records its tag on the server:

```bash
ssh deploy@187.77.167.2 'cat ~/loadless/.deploy_current ~/loadless/.deploy_previous'
```

To roll back to the previous release:

```bash
ssh deploy@187.77.167.2 'cd ~/loadless \
  && sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='"'"'$(cat .deploy_previous)'"'"'/" .env \
  && docker compose -f docker-compose.prod.yml up -d'
```

The deploy keeps the current release, the previous one and `:latest` on the box and
prunes older tags, so the rollback target is always present locally. Any older SHA can
still be pulled from Docker Hub.

## Backups (activate when the app is live with real data — deliberate, playbook §10)

```bash
# nightly cron on the VPS; upload OFFSITE (rclone → R2/B2)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U loadless -Fc loadless | gzip > backup-$(date +%F).dump.gz
```

Also back up the **`uploads_data`** volume (the photos) and note that `caddy_data`
(TLS certs + ACME account) is precious.

Retention 7 daily + 4 weekly. **A backup that has never been restore-tested does not
exist** — and verify the dump is non-empty, not just that the command exited 0. The
retired bbcorp campaign on this same box wrote "successful" 2 KB dumps for five weeks
because a failing `pg_dump` piped into `gzip` still exits 0. **Before every schema
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
