-- Monthly Actuals Foundation — purely ADDITIVE. No ALTER on any existing table,
-- no backfill, so the annual path (Import / StatementSnapshot / metrics / board
-- report) is byte-identical. One row per (fiscal_period_id, month_key 'YYYY-MM'),
-- upsert-REPLACE on re-upload.

-- CreateTable
CREATE TABLE "monthly_snapshots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "month_key" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_rows" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "mapping_version" TEXT NOT NULL,
    "standard_chart_version" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_snapshots_fiscal_period_id_month_key_key" ON "monthly_snapshots"("fiscal_period_id", "month_key");

-- CreateIndex
CREATE INDEX "monthly_snapshots_school_id_idx" ON "monthly_snapshots"("school_id");

-- CreateIndex
CREATE INDEX "monthly_snapshots_fiscal_period_id_idx" ON "monthly_snapshots"("fiscal_period_id");

-- AddForeignKey
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
