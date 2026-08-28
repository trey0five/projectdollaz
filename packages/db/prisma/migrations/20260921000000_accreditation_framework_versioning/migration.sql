-- WS1/WS2/WS3 — accreditation framework versioning (all additive; no backfill).
--   • aliases / superseded_by_code / rubric_descriptors / index_reference on frameworks
--   • plain_language on catalog standards (the authored explainer layer)
--   • owner_user_id on school standards (validated delegation, SetNull)
--   • the ONE per-(school, framework) metadata table: division/seal choice,
--     upgrade provenance, and the six-year-cycle anchor + persisted target.

-- AlterTable
ALTER TABLE "accreditation_frameworks"
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "superseded_by_code" TEXT,
  ADD COLUMN "rubric_descriptors" JSONB,
  ADD COLUMN "index_reference" JSONB,
  ADD COLUMN "recognitions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "accreditation_catalog_standards"
  ADD COLUMN "plain_language" TEXT;

-- AlterTable
ALTER TABLE "accreditation_standards"
  ADD COLUMN "owner_user_id" UUID;

-- CreateTable
CREATE TABLE "accreditation_framework_profiles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "division" TEXT,
    "upgraded_from_framework_id" UUID,
    "upgraded_at" TIMESTAMP(3),
    "last_review_date" DATE,
    "next_review_date" DATE,
    "term_years" INTEGER NOT NULL DEFAULT 6,
    "target_index" INTEGER,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accreditation_framework_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accreditation_framework_profiles_school_id_idx" ON "accreditation_framework_profiles"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "accreditation_framework_profiles_school_id_framework_id_key" ON "accreditation_framework_profiles"("school_id", "framework_id");

-- AddForeignKey
ALTER TABLE "accreditation_framework_profiles" ADD CONSTRAINT "accreditation_framework_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_framework_profiles" ADD CONSTRAINT "accreditation_framework_profiles_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "accreditation_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_framework_profiles" ADD CONSTRAINT "accreditation_framework_profiles_upgraded_from_framework_id_fkey" FOREIGN KEY ("upgraded_from_framework_id") REFERENCES "accreditation_frameworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_framework_profiles" ADD CONSTRAINT "accreditation_framework_profiles_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_standards" ADD CONSTRAINT "accreditation_standards_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
