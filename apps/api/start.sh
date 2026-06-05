#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Container entrypoint: apply pending migrations (idempotent), then run the API.
# `migrate deploy` only applies already-generated migrations — it never creates
# new ones, so it is safe to run on every container start.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "[start] applying database migrations (prisma migrate deploy)..."
# pnpm hoists the prisma bin under the db package; call the shim directly so we
# avoid pnpm's runtime dep-status check (which tries to reinstall under no-TTY).
packages/db/node_modules/.bin/prisma migrate deploy \
  --schema=packages/db/prisma/schema.prisma

echo "[start] seeding database (idempotent)..."
# Run the prisma seed from the db package dir so its package.json prisma.seed
# config is found. Idempotent upserts make this safe on every container start.
( cd packages/db && node_modules/.bin/prisma db seed ) || echo "[start] seed skipped/failed (non-fatal)"

echo "[start] launching api..."
exec node apps/api/dist/main.js
