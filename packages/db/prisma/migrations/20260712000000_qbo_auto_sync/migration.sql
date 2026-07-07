-- Automated / scheduled QuickBooks sync — additive nightly-sync columns on both
-- the per-school connection (swept now) and the org connection (forward-compat,
-- not swept in this slice). Plain ADD COLUMN with defaults; existing rows inherit
-- auto_sync_enabled=true, needs_reauth=false, auto_sync_failures=0. No backfill.

ALTER TABLE "qbo_connections"
  ADD COLUMN "auto_sync_enabled"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "needs_reauth"                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "last_scheduled_sync_at"       TIMESTAMP(3),
  ADD COLUMN "last_scheduled_sync_status"   TEXT,
  ADD COLUMN "last_scheduled_sync_error"    TEXT,
  ADD COLUMN "last_scheduled_sync_row_count" INTEGER,
  ADD COLUMN "reauth_notified_at"           TIMESTAMP(3),
  ADD COLUMN "auto_sync_failures"           INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "org_qbo_connections"
  ADD COLUMN "auto_sync_enabled"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "needs_reauth"                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "last_scheduled_sync_at"       TIMESTAMP(3),
  ADD COLUMN "last_scheduled_sync_status"   TEXT,
  ADD COLUMN "last_scheduled_sync_error"    TEXT,
  ADD COLUMN "last_scheduled_sync_row_count" INTEGER,
  ADD COLUMN "reauth_notified_at"           TIMESTAMP(3),
  ADD COLUMN "auto_sync_failures"           INTEGER NOT NULL DEFAULT 0;
