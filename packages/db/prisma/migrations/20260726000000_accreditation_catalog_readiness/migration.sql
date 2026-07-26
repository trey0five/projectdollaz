-- Accreditation Phase 3 — FRAMEWORK CATALOG + RUBRIC READINESS (strictly additive).
-- Two new PLATFORM-LEVEL tables (no school_id — shared reference data, seeded
-- idempotently at api boot by AccreditationCatalogService) + six nullable columns
-- on accreditation_standards. Every existing row stays valid with NO backfill
-- (legacy `rating` and all briefing inputs untouched), so it is safe to
-- `prisma migrate deploy` against the live DB. Timestamp sorts AFTER
-- 20260725000000_governance_people (the latest migration). House convention:
-- TEXT columns bounded by DTO @IsIn — no Postgres enums.

-- CreateTable: accreditor frameworks (Cognia 2022 / MSA-CESS 2022 / NSBECS).
CREATE TABLE "accreditation_frameworks" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "accreditor" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "rubric_labels" JSONB NOT NULL,
    "status_bands" JSONB NOT NULL,
    "index_min" INTEGER,
    "index_max" INTEGER,
    "default_target" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accreditation_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: framework code is the idempotent-seed upsert key.
CREATE UNIQUE INDEX "accreditation_frameworks_code_key" ON "accreditation_frameworks"("code");

-- CreateTable: one catalog node per framework standard/domain (domains are
-- parents, standards are leaves; is_assurance marks Cognia's binary gates).
CREATE TABLE "accreditation_catalog_standards" (
    "id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "evidence_tags" TEXT[] NOT NULL DEFAULT '{}',
    "is_assurance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "accreditation_catalog_standards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: (framework_id, code) is the idempotent-seed upsert key.
CREATE UNIQUE INDEX "accreditation_catalog_standards_framework_id_code_key" ON "accreditation_catalog_standards"("framework_id", "code");

-- CreateIndex: tree lookups (a framework's domain children).
CREATE INDEX "accreditation_catalog_standards_framework_id_parent_id_idx" ON "accreditation_catalog_standards"("framework_id", "parent_id");

-- AddForeignKey: deleting a framework drops its catalog rows (platform data only).
ALTER TABLE "accreditation_catalog_standards" ADD CONSTRAINT "accreditation_catalog_standards_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "accreditation_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: catalog self-tree — deleting a domain re-parents its leaves.
ALTER TABLE "accreditation_catalog_standards" ADD CONSTRAINT "accreditation_catalog_standards_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accreditation_catalog_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: six ADDITIVE nullable columns on the school standards register.
-- rubric_score (1..4, DTO-bounded) is the accreditor self-score; sort_order
-- preserves accreditor order on adopted trees; strategy_source_* is a SOFT link
-- (deliberately NO FK — the evidence sourceRef pattern; validated on write,
-- tolerant of dangling on read).
ALTER TABLE "accreditation_standards"
  ADD COLUMN "framework_id" UUID,
  ADD COLUMN "catalog_standard_id" UUID,
  ADD COLUMN "rubric_score" INTEGER,
  ADD COLUMN "sort_order" INTEGER,
  ADD COLUMN "strategy_source_type" TEXT,
  ADD COLUMN "strategy_source_ref" UUID;

-- AddForeignKey: SET NULL — catalog/framework cleanup never breaks a school row.
ALTER TABLE "accreditation_standards" ADD CONSTRAINT "accreditation_standards_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "accreditation_frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_standards" ADD CONSTRAINT "accreditation_standards_catalog_standard_id_fkey" FOREIGN KEY ("catalog_standard_id") REFERENCES "accreditation_catalog_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: DB-level adopt idempotency backstop — a school may hold each
-- catalog node AT MOST once. Postgres NULLS-DISTINCT semantics mean the many
-- hand-made rows (catalog_standard_id IS NULL) are unconstrained, so this is
-- safe with NO backfill. Concurrent adopts are additionally serialized by a
-- pg_advisory_xact_lock in AccreditationCatalogService.adoptFramework; this
-- index turns any residual race into an error instead of a duplicated tree.
CREATE UNIQUE INDEX "accreditation_standards_school_id_catalog_standard_id_key" ON "accreditation_standards"("school_id", "catalog_standard_id");
