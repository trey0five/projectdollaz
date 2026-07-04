-- Phase 4 Facilities depth — preventive/recurring maintenance + actual-vs-estimated
-- cost + a vendor field.
-- ADDITIVE: every column is nullable or carries a DEFAULT, so every existing row stays
-- valid with NO backfill (mirrors the tasks workflow-depth precedent). recurrence
-- defaults 'none' → existing maintenance items never spawn a successor. Touches NO
-- existing row/column data, so it is safe to `prisma migrate deploy` against the live DB.
-- Timestamp sorts AFTER 20260704000000_advancement_gifts (the latest migration).
ALTER TABLE "maintenance_items" ADD COLUMN "actual_cost" DECIMAL(14,2);
ALTER TABLE "maintenance_items" ADD COLUMN "vendor" TEXT;
ALTER TABLE "maintenance_items" ADD COLUMN "recurrence" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "maintenance_items" ADD COLUMN "recurrence_until" DATE;
ALTER TABLE "maintenance_items" ADD COLUMN "series_id" UUID;

-- Series lookups (all occurrences of one recurring item) stay school-scoped.
CREATE INDEX "maintenance_items_school_id_series_id_idx" ON "maintenance_items" ("school_id", "series_id");
