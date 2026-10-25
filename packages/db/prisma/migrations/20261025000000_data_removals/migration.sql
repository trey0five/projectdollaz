-- Finance data a person removed, kept restorable for 30 days ("Recently removed").
-- Additive: two new tables, no backfill. The removed rows are stored as to_jsonb(row)
-- in data_removal_items and moved back with their original ids on restore.

-- CreateTable
CREATE TABLE "data_removals" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "role" "ImportRole",
    "month_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT NOT NULL DEFAULT 'removed',
    "summary" JSONB NOT NULL,
    "removed_by" UUID,
    "removed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_removals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_removal_items" (
    "id" UUID NOT NULL,
    "removal_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "data_removal_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_removals_school_id_removed_at_idx" ON "data_removals"("school_id", "removed_at");

-- CreateIndex
CREATE INDEX "data_removals_fiscal_period_id_idx" ON "data_removals"("fiscal_period_id");

-- CreateIndex
CREATE INDEX "data_removals_expires_at_idx" ON "data_removals"("expires_at");

-- CreateIndex
CREATE INDEX "data_removal_items_removal_id_idx" ON "data_removal_items"("removal_id");

-- AddForeignKey
ALTER TABLE "data_removals" ADD CONSTRAINT "data_removals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_removals" ADD CONSTRAINT "data_removals_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_removal_items" ADD CONSTRAINT "data_removal_items_removal_id_fkey" FOREIGN KEY ("removal_id") REFERENCES "data_removals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

