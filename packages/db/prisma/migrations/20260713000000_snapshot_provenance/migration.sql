-- Audit trail / value-versioning — additive provenance stamp on statement snapshots.
-- Three NULLABLE columns, no default, no backfill, no FK/relation (soft refs so a
-- deleted import or deactivated user never cascades/blocks a historical snapshot).
-- Legacy rows stay NULL and fall through to read-time correlation. Sorts after
-- 20260712000000_qbo_auto_sync.
--   trigger              ∈ manual|upload|quickbooks_sync|scheduled_sync|remap  (NULL = legacy)
--   source_import_id     soft ref to Import.id when a TB import drove the snapshot
--   triggered_by_user_id local copy of the acting user id (avoids an audit join)

ALTER TABLE "statement_snapshots"
  ADD COLUMN "trigger"              TEXT,
  ADD COLUMN "source_import_id"     TEXT,
  ADD COLUMN "triggered_by_user_id" TEXT;
