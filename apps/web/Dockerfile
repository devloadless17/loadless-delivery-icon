# Build context = repo root (pnpm workspace). Next standalone output.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /repo

# ---- deps ---------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @loadless/web...

# ---- build --------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ENV NODE_ENV=production STANDALONE_OUTPUT=1
RUN pnpm --filter @loadless/shared build \
 && pnpm --filter @loadless/web build

# ---- runtime ------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:3100/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
