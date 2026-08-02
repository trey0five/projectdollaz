-- AIC Phase G — CONTINUOUS IMPROVEMENT MANAGER.
-- STRICTLY ADDITIVE. ZERO DML. No backfill, no UPDATE, no COALESCE.
--
-- These migrations run on container boot IN PRODUCTION; a failure here is a
-- container that never starts. Every ADD COLUMN is nullable or carries a DEFAULT,
-- so Postgres takes the metadata-only fast path and no table is rewritten.
--
-- The table is NOT renamed. Prisma's model is (StrategyInitiative ->
-- ImprovementInitiative) and @@map("strategy_initiatives") absorbs it, which is
-- why the previous phase's audit rows, indexes and FK names all still resolve.

-- ── 1. A goal is no longer required ─────────────────────────────────────────
-- A widening. Every existing row satisfies the looser constraint, and no running
-- code path can produce a NULL goal_id until commit 2's service ships.
ALTER TABLE "strategy_initiatives" ALTER COLUMN "goal_id" DROP NOT NULL;

-- ── 2. The manager's columns ────────────────────────────────────────────────
-- origin_type is the ONLY NOT NULL addition and it defaults to 'manual', which is
-- the literal truth about every pre-existing row: a person typed it in.
-- progress_source stays NULL on every legacy row and NULL means "status only".
ALTER TABLE "strategy_initiatives"
  ADD COLUMN "origin_type"               TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "origin_ref"                TEXT,
  ADD COLUMN "finding_key"               TEXT,
  ADD COLUMN "start_date"                DATE,
  ADD COLUMN "due_date"                  DATE,
  ADD COLUMN "completed_at"              TIMESTAMP(3),
  ADD COLUMN "progress_source"           TEXT,
  ADD COLUMN "milestones"                JSONB,
  ADD COLUMN "manual_progress_pct"       DECIMAL(6,4),
  ADD COLUMN "metric_key"                TEXT,
  ADD COLUMN "target_value"              DECIMAL(18,6),
  ADD COLUMN "baseline_value"            DECIMAL(18,6),
  ADD COLUMN "baseline_date"             DATE,
  ADD COLUMN "baseline_metric_period_id" UUID,
  ADD COLUMN "last_progress_at"          TIMESTAMP(3),
  ADD COLUMN "risk_level"                TEXT,
  ADD COLUMN "risk_note"                 TEXT,
  ADD COLUMN "target_rubric_score"       INTEGER;

-- Adoption idempotency (acceptance 5). A PLAIN unique index is correct here and a
-- partial one is not needed: in Postgres NULL is never equal to NULL, so every
-- pre-existing row (finding_key NULL) is distinct under this index and CREATE
-- UNIQUE INDEX on the populated table cannot fail. Two manual initiatives are
-- likewise always distinct.
CREATE UNIQUE INDEX "strategy_initiatives_school_id_finding_key_key"
  ON "strategy_initiatives"("school_id", "finding_key");

CREATE INDEX "strategy_initiatives_school_id_due_date_idx"
  ON "strategy_initiatives"("school_id", "due_date");
CREATE INDEX "strategy_initiatives_school_id_origin_type_idx"
  ON "strategy_initiatives"("school_id", "origin_type");

-- ── 3. The observation series ───────────────────────────────────────────────
-- APPEND-ONLY: no updated_at column, and the Prisma model carries no @updatedAt.
-- A projection is only honest if the readings it interpolates were recorded, not
-- recomputed, so this table is the record and nothing rewrites it.
--
-- "Every NOT NULL column needs a DEFAULT" binds ALTER TABLE ADD COLUMN; a CREATE
-- TABLE with zero rows has nothing to default (the Phase F precedent).
CREATE TABLE "improvement_progress_events" (
  "id"                 UUID         NOT NULL,
  "school_id"          UUID         NOT NULL,
  "initiative_id"      UUID         NOT NULL,
  -- The civil day the reading describes. UTC-midnight DATE, house convention.
  "observed_on"        DATE         NOT NULL,
  -- 'metric' | 'milestone' | 'task_rollup' | 'manual'. TEXT + DTO @IsIn.
  "source"             TEXT         NOT NULL,
  -- The RAW metric number at observed_on (source='metric'), else NULL.
  "value"              DECIMAL(18,6),
  -- The 0..1 fraction toward target at observed_on. NULL when unmeasurable.
  "pct"                DECIMAL(6,4),
  "note"               TEXT,
  -- The fiscal period the metric reading came from (source='metric'), else NULL.
  "metric_period_id"   UUID,
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "improvement_progress_events_pkey" PRIMARY KEY ("id")
);

-- One reading per (initiative, day, source): re-running the nightly recorder is a
-- no-op rather than a second point that fakes a denser series.
--
-- NOTE ON THE NAME — it is deliberately "…observed_on_sourc_key", not
-- "…observed_on_source_key". The full form is 64 bytes, one over Postgres's 63-byte
-- NAMEDATALEN limit. Postgres would truncate it to a plain 63-byte prefix
-- ("…_source_ke"); Prisma truncates the FIELD segment instead and preserves the
-- "_key" suffix ("…_sourc_key"). The two truncators disagree, so the name below is
-- Prisma's, spelled out, and `migrate diff` is clean because of it. Do not "fix"
-- this spelling.
CREATE UNIQUE INDEX "improvement_progress_events_initiative_id_observed_on_sourc_key"
  ON "improvement_progress_events"("initiative_id", "observed_on", "source");
CREATE INDEX "improvement_progress_events_school_id_idx"
  ON "improvement_progress_events"("school_id");
CREATE INDEX "improvement_progress_events_initiative_id_observed_on_idx"
  ON "improvement_progress_events"("initiative_id", "observed_on");

ALTER TABLE "improvement_progress_events"
  ADD CONSTRAINT "improvement_progress_events_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "improvement_progress_events_initiative_id_fkey"
    FOREIGN KEY ("initiative_id") REFERENCES "strategy_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "improvement_progress_events_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
