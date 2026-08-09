-- AlterTable
ALTER TABLE "cash_projection_runs" ADD COLUMN "adjustments" JSONB;

-- CreateTable
CREATE TABLE "cash_flow_line_adjustments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "source_ref" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "override_amount" DECIMAL(14,2),
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_line_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_line_adjustments_school_id_source_ref_key" ON "cash_flow_line_adjustments"("school_id", "source_ref");

-- CreateIndex
CREATE INDEX "cash_flow_line_adjustments_school_id_active_idx" ON "cash_flow_line_adjustments"("school_id", "active");

-- AddForeignKey
ALTER TABLE "cash_flow_line_adjustments" ADD CONSTRAINT "cash_flow_line_adjustments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
