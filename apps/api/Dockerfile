# ─────────────────────────────────────────────────────────────────────────────
# apps/api — multi-stage, LEAN image built from the repo ROOT context.
#
# Engine-consumption constraint: @finrep/engine is pure-ESM with `.js`-suffixed
# relative import specifiers and exports ./dist/index.js. The api therefore
# consumes the engine from its BUILT dist (NOT source). `turbo build
# --filter=@finrep/api` builds the workspace deps (@finrep/db client + engine)
# first (dependsOn ["^build"]) then the api.
#
# Migrations: `prisma generate` at BUILD time; `prisma migrate deploy`
# (idempotent) at START time — never `migrate dev` in a container.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: pruner — turbo prune to a minimal subtree (api + its workspace deps)
FROM node:22-slim AS pruner
WORKDIR /app
RUN corepack enable pnpm
COPY . .
RUN pnpm dlx turbo@^2.5.0 prune @finrep/api --docker

# ── Stage 2: installer — install deps (cached), then build + prisma generate
FROM node:22-slim AS installer
WORKDIR /app
RUN corepack enable pnpm
# Prisma's query engine needs openssl at generate/runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Cacheable dependency layer: only manifests + lockfile change rarely.
# out/json/ carries the pruned package.json's + .npmrc + pnpm-workspace.yaml.
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Source of the pruned subtree, then build (engine + db client first, then api).
# turbo prune omits the root tsconfig.base.json that every package's tsconfig
# extends — copy it in explicitly so tsup/tsc dts builds resolve it.
COPY --from=pruner /app/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm -F @finrep/db exec prisma generate \
  && pnpm dlx turbo@^2.5.0 build --filter=@finrep/api

# ── Stage 3: runner — slim runtime with only what's needed to run the API
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/*

# Pruned node_modules (incl. generated Prisma client + the prisma CLI shim under
# packages/db/node_modules/.bin), built dists, the db package (schema +
# migrations) and the api build output. start.sh runs `migrate deploy` via that
# shim, then `node apps/api/dist/main.js`.
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/packages ./packages
COPY --from=installer /app/apps/api/package.json ./apps/api/package.json
COPY --from=installer /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=installer /app/apps/api/dist ./apps/api/dist
COPY --from=installer /app/package.json ./package.json
COPY apps/api/start.sh ./start.sh
# Drop build-only tooling from the pnpm store that is never imported by the
# COMPILED api (verified: dist imports only @finrep/{db,engine}, @nestjs/*,
# class-validator, class-transformer + their runtime transitives). We keep the
# prisma CLI + @prisma/* (needed by start.sh `migrate deploy`) and the nest
# runtime. Everything below is dev/build-only and safe to prune, trimming the
# runtime store meaningfully.
RUN find node_modules/.pnpm -maxdepth 1 -type d \( \
      -name 'turbo@*' -o -name '@turbo+*' \
      -o -name 'typescript@*' -o -name 'typescript-eslint@*' \
      -o -name '@typescript-eslint+*' \
      -o -name 'esbuild@*' -o -name '@esbuild+*' \
      -o -name 'tsup@*' -o -name 'eslint@*' -o -name '@eslint+*' \
      -o -name '@nestjs+cli@*' -o -name '@nestjs+schematics@*' \
      -o -name 'webpack@*' -o -name 'webpack-*' -o -name 'vite@*' \
      -o -name 'rollup@*' -o -name '@rollup+*' \
      -o -name 'xlsx@*' -o -name 'codepage@*' -o -name 'cfb@*' \
      -o -name 'fast-glob@*' -o -name 'caniuse-lite@*' \
      -o -name '@swc+*' -o -name 'terser@*' \
    \) -prune -exec rm -rf {} + \
  && find node_modules apps packages -name '*.map' -type f -delete 2>/dev/null || true \
  && chmod +x ./start.sh && chown -R node:node /app

USER node
EXPOSE 8000
# migrate deploy (idempotent) then launch the compiled API.
ENTRYPOINT ["./start.sh"]
