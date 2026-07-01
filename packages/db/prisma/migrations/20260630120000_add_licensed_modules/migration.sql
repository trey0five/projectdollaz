-- Per-module entitlement backbone (additive, safe on all existing rows).
-- The column is NULLABLE with NO default and NO backfill: existing rows stay
-- NULL and are interpreted as {finance} (+ core) at READ time in the API
-- (billing.service resolveLicensed). NULL must mean "legacy → finance"; an empty
-- array would mean "licensed to nothing" and could lock out an active school, so
-- we intentionally do NOT default it. A fast metadata-only ADD COLUMN.
ALTER TABLE "subscriptions" ADD COLUMN "licensed_modules" JSONB;
