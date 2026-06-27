-- CreateTable
CREATE TABLE "capital_schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capital_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "accounts" JSONB NOT NULL DEFAULT '[]',
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capital_schedules_school_id_idx" ON "capital_schedules"("school_id");

-- CreateIndex
CREATE INDEX "capital_schedules_fiscal_period_id_idx" ON "capital_schedules"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "capital_schedules_school_id_fiscal_period_id_key" ON "capital_schedules"("school_id", "fiscal_period_id");

-- CreateIndex
CREATE INDEX "cash_schedules_school_id_idx" ON "cash_schedules"("school_id");

-- CreateIndex
CREATE INDEX "cash_schedules_fiscal_period_id_idx" ON "cash_schedules"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_schedules_school_id_fiscal_period_id_key" ON "cash_schedules"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "capital_schedules" ADD CONSTRAINT "capital_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_schedules" ADD CONSTRAINT "capital_schedules_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_schedules" ADD CONSTRAINT "capital_schedules_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_schedules" ADD CONSTRAINT "cash_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_schedules" ADD CONSTRAINT "cash_schedules_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_schedules" ADD CONSTRAINT "cash_schedules_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
