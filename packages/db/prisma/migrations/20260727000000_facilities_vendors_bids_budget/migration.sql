-- Facilities Phase 4 — vendors, competing bids + Leadership approval stamp, and the
-- inherited-from-Finance facilities budget mapping (additive only — every existing
-- row stays valid with NO backfill). status/category are TEXT bounded by DTO @IsIn
-- lists, NOT Postgres enums (house convention — cheap migrations).

-- CreateTable: per-school vendor/contractor register.
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable: competing vendor quotes on one maintenance item.
CREATE TABLE "maintenance_bids" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "vendor_id" UUID,
    "vendor_name" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable: one-row-per-school facilities settings (budget line mapping).
CREATE TABLE "facilities_settings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "budget_expense_keys" JSONB,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facilities_settings_pkey" PRIMARY KEY ("id")
);

-- AlterTable: additive decision/vendor columns on the maintenance register. All
-- nullable — zero backfill; selected_bid_id is a SOFT ref (no FK — avoids an
-- Item<->Bid cycle; validated in the service).
ALTER TABLE "maintenance_items" ADD COLUMN "vendor_id" UUID,
ADD COLUMN "selected_bid_id" UUID,
ADD COLUMN "decided_by_user_id" UUID,
ADD COLUMN "decided_at" TIMESTAMP(3),
ADD COLUMN "decision_note" TEXT,
ADD COLUMN "resolved_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "vendors_school_id_idx" ON "vendors"("school_id");

-- CreateIndex
CREATE INDEX "maintenance_bids_school_id_idx" ON "maintenance_bids"("school_id");

-- CreateIndex
CREATE INDEX "maintenance_bids_school_id_item_id_idx" ON "maintenance_bids"("school_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_settings_school_id_key" ON "facilities_settings"("school_id");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_bids" ADD CONSTRAINT "maintenance_bids_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_bids" ADD CONSTRAINT "maintenance_bids_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "maintenance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_bids" ADD CONSTRAINT "maintenance_bids_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_bids" ADD CONSTRAINT "maintenance_bids_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities_settings" ADD CONSTRAINT "facilities_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities_settings" ADD CONSTRAINT "facilities_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
