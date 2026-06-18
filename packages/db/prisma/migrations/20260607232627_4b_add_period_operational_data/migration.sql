-- CreateTable
CREATE TABLE "period_operational_data" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "enrollment" INTEGER,
    "enrollment_fte" DECIMAL(10,2),
    "students_on_aid" INTEGER,
    "financial_aid_total" DECIMAL(18,2),
    "notes" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_operational_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_operational_data_school_id_idx" ON "period_operational_data"("school_id");

-- CreateIndex
CREATE INDEX "period_operational_data_fiscal_period_id_idx" ON "period_operational_data"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_operational_data_school_id_fiscal_period_id_key" ON "period_operational_data"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "period_operational_data" ADD CONSTRAINT "period_operational_data_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_operational_data" ADD CONSTRAINT "period_operational_data_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_operational_data" ADD CONSTRAINT "period_operational_data_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
