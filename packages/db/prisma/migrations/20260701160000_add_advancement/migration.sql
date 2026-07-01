-- Phase 4 Advancement v1 — the fundraising campaign/appeal register.
-- ADDITIVE: one brand-new table + one index + two FKs. Touches NO existing row or
-- column, so it is safe to `prisma migrate deploy` against the live DB. Timestamp
-- sorts AFTER 20260701150000_add_facilities (the latest migration). The school FK
-- cascades on tenant delete; the created-by user FK sets null on user delete.
-- raised_amount is NULLABLE (mirrors estimated_cost; the service defaults an omitted
-- create to 0) — so schema.prisma (Decimal?) and this DDL stay in lockstep.
-- Mirrors the facilities migration conventions.

-- CreateTable
CREATE TABLE "advancement_campaigns" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "campaign_type" TEXT,
    "goal_amount" DECIMAL(14,2),
    "raised_amount" DECIMAL(14,2),
    "fiscal_year" INTEGER,
    "start_date" DATE,
    "close_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advancement_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advancement_campaigns_school_id_idx" ON "advancement_campaigns"("school_id");

-- AddForeignKey
ALTER TABLE "advancement_campaigns" ADD CONSTRAINT "advancement_campaigns_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advancement_campaigns" ADD CONSTRAINT "advancement_campaigns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
