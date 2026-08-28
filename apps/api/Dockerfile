# Build context = repo root (pnpm workspace).
# node:22-bookworm-slim per playbook (never alpine: glibc-only prebuilds e.g. argon2).

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /repo

# ---- deps ---------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @loadless/api...

# ---- build --------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @loadless/shared build \
 && cd apps/api && npx prisma generate && pnpm build
# Pruned production bundle (prod deps + dist + prisma/ + workspace shared)
RUN pnpm --filter @loadless/api deploy --prod --legacy /out \
 && cd /out && npx prisma generate

# ---- runtime ------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Local uploads dir only matters when STORAGE_DRIVER=local (dev/emergency)
RUN install -d -o node -g node /app/uploads
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:4100/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
