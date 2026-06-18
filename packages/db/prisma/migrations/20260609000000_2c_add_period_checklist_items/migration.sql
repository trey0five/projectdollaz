-- CreateTable
CREATE TABLE "period_checklist_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "item_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_checklist_items_school_id_fiscal_period_id_idx" ON "period_checklist_items"("school_id", "fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_checklist_items_school_id_fiscal_period_id_item_id_key" ON "period_checklist_items"("school_id", "fiscal_period_id", "item_id");

-- AddForeignKey
ALTER TABLE "period_checklist_items" ADD CONSTRAINT "period_checklist_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_checklist_items" ADD CONSTRAINT "period_checklist_items_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_checklist_items" ADD CONSTRAINT "period_checklist_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
