-- Phase 4 Advancement v1 — Gifts & Pledges under a campaign.
-- ADDITIVE: one brand-new table + two indexes + three FKs. Touches NO existing row or
-- column, so it is safe to `prisma migrate deploy` against the live DB. Timestamp sorts
-- AFTER 20260703030000_add_invitation_org_wide (the latest migration). The school FK and
-- the campaign FK BOTH cascade on delete (deleting a campaign drops its gifts so the
-- "raised" rollup recomputes with no orphans); the created-by user FK sets null on user
-- delete. amount is NOT NULL; received_amount defaults 0; kind/status are TEXT with a
-- @default (the DTO @IsIn + service derivation enforce the enum) — so schema.prisma and
-- this DDL stay in lockstep. Mirrors the advancement_campaigns migration conventions.

-- CreateTable
CREATE TABLE "advancement_gifts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'gift',
    "amount" DECIMAL(14,2) NOT NULL,
    "received_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'received',
    "occurred_on" DATE NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "source" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advancement_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advancement_gifts_school_id_idx" ON "advancement_gifts"("school_id");

-- CreateIndex
CREATE INDEX "advancement_gifts_campaign_id_idx" ON "advancement_gifts"("campaign_id");

-- AddForeignKey
ALTER TABLE "advancement_gifts" ADD CONSTRAINT "advancement_gifts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advancement_gifts" ADD CONSTRAINT "advancement_gifts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "advancement_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advancement_gifts" ADD CONSTRAINT "advancement_gifts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
