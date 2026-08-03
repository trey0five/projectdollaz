#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Container entrypoint: apply pending migrations (idempotent), then run the API.
# `migrate deploy` only applies already-generated migrations — it never creates
# new ones, so it is safe to run on every container start.
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ─────────────────────────────────────────────────────────────────────────────
# Assemble DATABASE_URL from the discrete parts ECS injects (host/port/name as
# env, user/password from Secrets Manager). The Node app does this in
# bootstrap-env.ts, but the `prisma` CLI below runs BEFORE the app and needs the
# URL too — so build it here (idempotent; bootstrap-env re-derives the same
# value). Reuse node's encodeURIComponent so special chars in the RDS-managed
# password are encoded identically to bootstrap-env.ts.
#
# AIC Phase I — CONNECTION POOL. Prisma's default pool is num_cpus*2+1, i.e. FIVE
# on a 2-vCPU task, which one bounded org fan-out saturates (→ P2024). Both this
# script and bootstrap-env.ts now emit connection_limit + pool_timeout from the
# SAME env vars (DATABASE_CONNECTION_LIMIT / DATABASE_POOL_TIMEOUT) with the SAME
# defaults (10 / 20).
#
# THE APP-SIDE EDIT IS NOT OPTIONAL AND THIS COMMENT IS WHY. bootstrap-env.ts
# overwrites process.env.DATABASE_URL unconditionally in AWS mode, so a
# connection_limit set only here reaches `prisma migrate deploy` and is discarded
# before the application opens a single pool. "bootstrap-env re-derives the same
# value" is only true while both sides carry these params — change one, change both.
# ─────────────────────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ] && [ -n "${DATABASE_HOST:-}" ]; then
  DATABASE_URL="$(node -e 'const u=encodeURIComponent(process.env.DATABASE_USER||""),p=encodeURIComponent(process.env.DATABASE_PASSWORD||""),host=process.env.DATABASE_HOST,port=process.env.DATABASE_PORT||"5432",name=process.env.DATABASE_NAME||"finrep",schema=process.env.DATABASE_SCHEMA||"public",ssl=process.env.DATABASE_SSLMODE||(process.env.NODE_ENV==="production"?"require":""),cl=process.env.DATABASE_CONNECTION_LIMIT||"10",pt=process.env.DATABASE_POOL_TIMEOUT||"20";let q="schema="+encodeURIComponent(schema);if(ssl)q+="&sslmode="+ssl;q+="&connection_limit="+encodeURIComponent(cl)+"&pool_timeout="+encodeURIComponent(pt);process.stdout.write("postgresql://"+u+":"+p+"@"+host+":"+port+"/"+name+"?"+q)')"
  export DATABASE_URL
fi

echo "[start] applying database migrations (prisma migrate deploy)..."
# pnpm hoists the prisma bin under the db package; call the shim directly so we
# avoid pnpm's runtime dep-status check (which tries to reinstall under no-TTY).
packages/db/node_modules/.bin/prisma migrate deploy \
  --schema=packages/db/prisma/schema.prisma

echo "[start] seeding database (idempotent)..."
# Run the prisma seed from the db package dir so its package.json prisma.seed
# config is found. Idempotent upserts make this safe on every container start.
( cd packages/db && node_modules/.bin/prisma db seed ) || echo "[start] seed skipped/failed (non-fatal)"

# ─────────────────────────────────────────────────────────────────────────────
# Strict end-to-end TLS: when ENABLE_TLS=true (prod), generate a self-signed cert
# so the app serves HTTPS and the ALB→task hop inside the VPC is encrypted. The
# ALB does not validate the backend cert (encryption-only), so a self-signed cert
# is sufficient. Local dev leaves ENABLE_TLS unset → plain HTTP.
# ─────────────────────────────────────────────────────────────────────────────
if [ "${ENABLE_TLS:-}" = "true" ]; then
  CERT_DIR="${TLS_CERT_DIR:-/app/certs}"
  mkdir -p "$CERT_DIR"
  if [ ! -s "$CERT_DIR/tls.crt" ]; then
    echo "[start] generating self-signed TLS cert (ALB→task encryption)..."
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -keyout "$CERT_DIR/tls.key" -out "$CERT_DIR/tls.crt" \
      -subj "/CN=ourkyro-api" >/dev/null 2>&1
  fi
  export HTTPS_KEY_FILE="$CERT_DIR/tls.key"
  export HTTPS_CERT_FILE="$CERT_DIR/tls.crt"
fi

echo "[start] launching api..."
exec node apps/api/dist/main.js
