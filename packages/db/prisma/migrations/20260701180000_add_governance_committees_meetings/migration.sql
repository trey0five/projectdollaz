-- Phase 3 Governance depth — COMMITTEES + MEETINGS (additive; extends the
-- 'governance' module's Policy Register with the board-meeting register).
-- Two new tables + indexes + FKs. Committee school CASCADE; meeting school
-- CASCADE, committee SET NULL (deleting a committee nulls its meetings, never
-- cascades away meeting history), approvedBy/updatedBy user SET NULL.

-- CreateTable
CREATE TABLE "governance_committees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "description" TEXT,
    "chair" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_committees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_committees_school_id_idx" ON "governance_committees"("school_id");

-- CreateTable
CREATE TABLE "governance_meetings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "committee_id" UUID,
    "title" TEXT NOT NULL,
    "scheduled_at" DATE NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "agenda" TEXT,
    "minutes" TEXT,
    "decisions" TEXT,
    "minutes_status" TEXT NOT NULL DEFAULT 'none',
    "minutes_approved_at" DATE,
    "minutes_approved_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_meetings_school_id_idx" ON "governance_meetings"("school_id");

-- CreateIndex
CREATE INDEX "governance_meetings_committee_id_idx" ON "governance_meetings"("committee_id");

-- AddForeignKey
ALTER TABLE "governance_committees" ADD CONSTRAINT "governance_committees_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_committees" ADD CONSTRAINT "governance_committees_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "governance_committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_minutes_approved_by_user_id_fkey" FOREIGN KEY ("minutes_approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
