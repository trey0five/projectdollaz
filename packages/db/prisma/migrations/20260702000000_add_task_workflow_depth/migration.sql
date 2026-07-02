-- Phase 3 Workflow depth — recurring tasks + multi-step approval chains.
-- Purely additive: every column is nullable or carries a DEFAULT, so every
-- existing row stays valid with NO backfill (mirrors the approval_status default
-- precedent). recurrence defaults 'none' → existing tasks never spawn a successor.
ALTER TABLE "tasks" ADD COLUMN "recurrence" text NOT NULL DEFAULT 'none';
ALTER TABLE "tasks" ADD COLUMN "recurrence_until" date;
ALTER TABLE "tasks" ADD COLUMN "series_id" uuid;
ALTER TABLE "tasks" ADD COLUMN "approval_steps" jsonb;

-- Series lookups (all occurrences of one recurring task) stay school-scoped.
CREATE INDEX "tasks_school_id_series_id_idx" ON "tasks" ("school_id", "series_id");
