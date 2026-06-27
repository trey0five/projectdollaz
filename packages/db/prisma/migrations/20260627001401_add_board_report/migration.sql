-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "brand_color" TEXT,
ADD COLUMN     "default_committee" TEXT,
ADD COLUMN     "logo_base64" TEXT;

-- CreateTable
CREATE TABLE "board_reports" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "report_title" TEXT,
    "committee_name" TEXT,
    "granularity" TEXT NOT NULL DEFAULT 'annual',
    "mda_text" TEXT,
    "mda_source" TEXT,
    "explanations" JSONB,
    "generated_at" TIMESTAMP(3),
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_reports_school_id_idx" ON "board_reports"("school_id");

-- CreateIndex
CREATE INDEX "board_reports_fiscal_period_id_idx" ON "board_reports"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_reports_school_id_fiscal_period_id_key" ON "board_reports"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
