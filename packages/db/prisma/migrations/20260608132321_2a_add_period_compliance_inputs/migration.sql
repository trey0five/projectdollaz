-- CreateTable
CREATE TABLE "period_compliance_inputs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "scholarship_funds_received" DECIMAL(18,2),
    "programs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "funds_at_insured_institution" BOOLEAN,
    "avg_daily_balance_over_250k" BOOLEAN,
    "bank_rating_reviewed_top_two" BOOLEAN,
    "reconciled_within_60_days" BOOLEAN,
    "reconciliation_independently_reviewed" BOOLEAN,
    "doe_status_approved" BOOLEAN,
    "years_in_operation" INTEGER,
    "surety_bond_posted" BOOLEAN,
    "fesua_any_account_over_50k" BOOLEAN,
    "notes" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_compliance_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_compliance_inputs_school_id_idx" ON "period_compliance_inputs"("school_id");

-- CreateIndex
CREATE INDEX "period_compliance_inputs_fiscal_period_id_idx" ON "period_compliance_inputs"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_compliance_inputs_school_id_fiscal_period_id_key" ON "period_compliance_inputs"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "period_compliance_inputs" ADD CONSTRAINT "period_compliance_inputs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_compliance_inputs" ADD CONSTRAINT "period_compliance_inputs_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_compliance_inputs" ADD CONSTRAINT "period_compliance_inputs_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
