# ─────────────────────────────────────────────────────────────────────────────
# apps/web — multi-stage: turbo-pruned Vite build, served as static files by
# nginx. Built from the repo ROOT context.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: pruner
FROM node:22-slim AS pruner
WORKDIR /app
RUN corepack enable pnpm
COPY . .
RUN pnpm dlx turbo@^2.5.0 prune @finrep/web --docker

# ── Stage 2: builder
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm dlx turbo@^2.5.0 build --filter=@finrep/web

# ── Stage 3: nginx runtime serving the static dist
FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
