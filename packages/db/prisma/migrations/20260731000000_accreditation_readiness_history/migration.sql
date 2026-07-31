-- Accreditation Intelligence Phase A — the READINESS SERIES (strictly additive).
--
-- One new table (accreditation_readiness_snapshots) + three defaulted/nullable
-- columns on accreditation_standards. Every existing row stays valid with NO
-- backfill, so this is safe to `prisma migrate deploy` against the live DB.
--
-- CONSTRAINTS HONORED: additive only; no backfill; no data migration; no raw
-- DML; no COALESCE; NO FUNCTIONAL INDEX (58 prior migrations contain zero, and
-- this one does not introduce the first). House convention: TEXT columns bounded
-- by DTO @IsIn — no Postgres enums (`reason`, `series_key`, `score_provenance`).
--
-- WHY series_key IS A NOT NULL TEXT rather than a nullable framework_id: the
-- unique key below is a PLAIN composite unique, and Postgres treats NULLs as
-- DISTINCT — a nullable framework_id would let a framework-less school write an
-- unbounded number of rows for the same day. 'none' is a real, comparable value,
-- so one row per school per day is enforced by the index itself.
--
-- WHY series_key IS THE FRAMEWORK CODE and never the read-time "dominant
-- framework" heuristic: that heuristic re-resolves on every read and FLIPS the
-- moment a school adopts a second framework, which would silently swap what the
-- stored series measures. The code is stable, so a school on two frameworks
-- simply keeps two independent series.
--
-- domain_scores is created NULLABLE and is written NULL for the whole of Phase A
-- (Phase B fills it). It exists now so Phase B needs no table rewrite.

-- AlterTable: score PROVENANCE on the standards register. A rubric self-score is
-- an ASSERTION; these columns record that it is one, when it was made, and by
-- whom. Defaulted/nullable → zero backfill, and legacy rows read as 'self' with
-- an unknown (NULL) timestamp, which is the honest answer for a score that
-- predates provenance tracking.
ALTER TABLE "accreditation_standards" ADD COLUMN     "rubric_scored_at" TIMESTAMP(3),
ADD COLUMN     "rubric_scored_by_user_id" UUID,
ADD COLUMN     "score_provenance" TEXT NOT NULL DEFAULT 'self';

-- CreateTable: the append-only readiness series. readiness_pct is the frozen
-- engine's blended figure; self_scored_pct (DOCUMENTED, rubric only) and
-- verified_pct (DEFENSIBLE, evidence only) are stored ALONGSIDE it so the UI can
-- always show the pair and never a single blended headline. leaf_scores carries
-- the per-leaf detail the four-way delta decomposition is computed from, so a
-- historical comparison never depends on today's mutable register.
CREATE TABLE "accreditation_readiness_snapshots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "framework_id" UUID,
    "series_key" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL DEFAULT 'nightly',
    "readiness_pct" INTEGER NOT NULL,
    "self_scored_pct" INTEGER NOT NULL,
    "verified_pct" INTEGER NOT NULL,
    "projected_index" INTEGER,
    "band" TEXT,
    "leaf_count" INTEGER NOT NULL,
    "scored_count" INTEGER NOT NULL,
    "covered_count" INTEGER NOT NULL,
    "domain_scores" JSONB,
    "leaf_scores" JSONB NOT NULL,
    "engine_version" TEXT NOT NULL,
    "catalog_version" TEXT,
    "payload_hash" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "accreditation_readiness_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: whole-school scans (every series on a day).
CREATE INDEX "accreditation_readiness_snapshots_school_id_snapshot_date_idx" ON "accreditation_readiness_snapshots"("school_id", "snapshot_date");

-- CreateIndex: the read path — newest-first points for ONE series. (Prisma
-- truncates the generated identifier to Postgres' 63-byte limit; the shortened
-- "_snap_idx"/"_snap_key" suffixes are Prisma's own and MUST be kept verbatim or
-- the next `migrate dev` reports drift.)
CREATE INDEX "accreditation_readiness_snapshots_school_id_series_key_snap_idx" ON "accreditation_readiness_snapshots"("school_id", "series_key", "snapshot_date" DESC);

-- CreateIndex: idempotence backstop — at most ONE row per (school, series, day).
-- The nightly capture upserts on this key, so a re-run (or a second replica)
-- overwrites rather than duplicating.
CREATE UNIQUE INDEX "accreditation_readiness_snapshots_school_id_series_key_snap_key" ON "accreditation_readiness_snapshots"("school_id", "series_key", "snapshot_date");

-- AddForeignKey: SET NULL — deleting a user erases the ATTRIBUTION of a score,
-- never the score itself.
ALTER TABLE "accreditation_standards" ADD CONSTRAINT "accreditation_standards_rubric_scored_by_user_id_fkey" FOREIGN KEY ("rubric_scored_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: a deleted school takes its history with it (tenant erasure).
ALTER TABLE "accreditation_readiness_snapshots" ADD CONSTRAINT "accreditation_readiness_snapshots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SET NULL — platform catalog cleanup never destroys a school's
-- recorded history. series_key (TEXT) remains, so the series stays identifiable.
ALTER TABLE "accreditation_readiness_snapshots" ADD CONSTRAINT "accreditation_readiness_snapshots_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "accreditation_frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
