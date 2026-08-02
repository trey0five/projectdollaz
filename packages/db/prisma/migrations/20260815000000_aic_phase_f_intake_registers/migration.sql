-- AIC Phase F — INTAKE REGISTERS I.
-- STRICTLY ADDITIVE. ZERO DML. No backfill, no UPDATE, no COALESCE.
--
-- Safe to `prisma migrate deploy` while the PREVIOUS image is still serving: nothing
-- in the running code selects any of this, the two new tables are unreferenced, and
-- the one added column is NULLABLE. These migrations run on container boot in
-- production; a failure here is a container that never starts.
--
-- The requirement-row FLIPS (COG-10 / COG-A3 / NSBECS-12) are NOT here and must never
-- be: AccreditationCatalogService.seedFramework pass 3 upserts every requirement row
-- by (catalog_standard_id, tag) on BOTH create and update on every boot, so changing
-- the typed seed IS the migration for platform reference data. Writing DML for it
-- would be a second source of truth for rows that self-heal.

-- ── 1. The staff-evaluation register ────────────────────────────────────────
CREATE TABLE "staff_evaluations" (
  "id"                 UUID         NOT NULL,
  "school_id"          UUID         NOT NULL,
  "person_id"          UUID         NOT NULL,
  "cycle_label"        TEXT         NOT NULL,
  "due_date"           DATE         NOT NULL,
  "completed_date"     DATE,
  "evaluator_name"     TEXT,
  "status"             TEXT         NOT NULL DEFAULT 'scheduled',
  "notes"              TEXT,
  "created_by_user_id" UUID,
  "updated_by_user_id" UUID,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_evaluations_school_id_idx"          ON "staff_evaluations"("school_id");
CREATE INDEX "staff_evaluations_school_id_due_date_idx" ON "staff_evaluations"("school_id", "due_date");
CREATE INDEX "staff_evaluations_person_id_idx"          ON "staff_evaluations"("person_id");

ALTER TABLE "staff_evaluations"
  ADD CONSTRAINT "staff_evaluations_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_evaluations_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "governance_people"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_evaluations_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_evaluations_updated_by_user_id_fkey"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. The prior-visit findings register ────────────────────────────────────
CREATE TABLE "accreditation_prior_visit_findings" (
  "id"                  UUID         NOT NULL,
  "school_id"           UUID         NOT NULL,
  "framework_id"        UUID,
  "visit_date"          DATE         NOT NULL,
  "cited_standard_code" TEXT         NOT NULL,
  "text"                TEXT         NOT NULL,
  "status"              TEXT         NOT NULL DEFAULT 'open',
  "closed_date"         DATE,
  "evidence_ref"        TEXT,
  "created_by_user_id"  UUID,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accreditation_prior_visit_findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accreditation_prior_visit_findings_school_id_idx"
  ON "accreditation_prior_visit_findings"("school_id");
CREATE INDEX "accreditation_prior_visit_findings_school_id_status_idx"
  ON "accreditation_prior_visit_findings"("school_id", "status");

ALTER TABLE "accreditation_prior_visit_findings"
  ADD CONSTRAINT "accreditation_prior_visit_findings_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "accreditation_prior_visit_findings_framework_id_fkey"
    FOREIGN KEY ("framework_id") REFERENCES "accreditation_frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "accreditation_prior_visit_findings_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. One nullable column on the facilities register ───────────────────────
-- NULLABLE, so every existing row is valid post-migration with no backfill, and a
-- NULL kind keeps today's behaviour exactly.
ALTER TABLE "maintenance_items"
  ADD COLUMN "compliance_kind" TEXT;

-- Partial index: the compliance-inspection collector and the evidence anchor both
-- filter on `compliance_kind IS NOT NULL`, and on a register where almost every row
-- is an ordinary item the partial index is the whole table's worth of rows smaller.
--
-- Prisma cannot express a partial index, so this one is intentionally absent from
-- schema.prisma (see the comment on MaintenanceItem.complianceKind). Do not add an
-- `@@index` for it: that would claim a plain index this database does not have.
CREATE INDEX "maintenance_items_school_id_compliance_kind_idx"
  ON "maintenance_items"("school_id", "compliance_kind")
  WHERE "compliance_kind" IS NOT NULL;
