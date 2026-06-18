-- CreateTable
CREATE TABLE "scholarship_disbursements" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "student_ref" TEXT,
    "program" TEXT,
    "pay_date" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "term" TEXT,
    "batch_ref" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarship_disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scholarship_disbursements_school_id_fiscal_period_id_idx" ON "scholarship_disbursements"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "scholarship_disbursements" ADD CONSTRAINT "scholarship_disbursements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_disbursements" ADD CONSTRAINT "scholarship_disbursements_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
