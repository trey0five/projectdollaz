-- Phase 4 Accreditation v1 — the STANDARDS + EVIDENCE register.
-- ADDITIVE: two brand-new tables + three indexes + six FKs. Touches NO existing
-- row or column, so it is safe to `prisma migrate deploy` against the live DB.
-- Timestamp sorts AFTER 20260630140000_add_policies. Both school FKs cascade on
-- tenant delete; both updated/created-by user FKs set null on user delete; the
-- evidence -> standard FK cascades (deleting a standard drops its evidence).
-- Mirrors the policies migration conventions.

-- CreateTable
CREATE TABLE "accreditation_standards" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "review_date" DATE,
    "owner" TEXT,
    "notes" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accreditation_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accreditation_evidence" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "standard_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'document',
    "reference" TEXT,
    "notes" TEXT,
    "captured_at" DATE,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accreditation_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accreditation_standards_school_id_idx" ON "accreditation_standards"("school_id");

-- CreateIndex
CREATE INDEX "accreditation_evidence_school_id_idx" ON "accreditation_evidence"("school_id");

-- CreateIndex
CREATE INDEX "accreditation_evidence_standard_id_idx" ON "accreditation_evidence"("standard_id");

-- AddForeignKey
ALTER TABLE "accreditation_standards" ADD CONSTRAINT "accreditation_standards_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_standards" ADD CONSTRAINT "accreditation_standards_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_evidence" ADD CONSTRAINT "accreditation_evidence_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_evidence" ADD CONSTRAINT "accreditation_evidence_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "accreditation_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_evidence" ADD CONSTRAINT "accreditation_evidence_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
