-- CreateTable
CREATE TABLE "period_budgets" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "total_revenue" DECIMAL(18,2),
    "total_expenses" DECIMAL(18,2),
    "notes" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "period_budgets_school_id_fiscal_period_id_key" ON "period_budgets"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "period_budgets" ADD CONSTRAINT "period_budgets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_budgets" ADD CONSTRAINT "period_budgets_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
