-- Phase 3 Governance v1 — the POLICY REGISTER.
-- ADDITIVE: a brand-new table + one index + two FKs. Touches NO existing row or
-- column, so it is safe to `prisma migrate deploy` against the live DB. The
-- school FK cascades on tenant delete; the updated-by FK sets null on user
-- delete (mirrors board_reports / period_corrective_actions).
-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "owner" TEXT,
    "adopted_date" DATE,
    "last_reviewed_date" DATE,
    "review_interval_months" INTEGER NOT NULL DEFAULT 12,
    "notes" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policies_school_id_idx" ON "policies"("school_id");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
