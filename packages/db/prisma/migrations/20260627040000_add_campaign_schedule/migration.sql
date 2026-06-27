-- CreateTable
CREATE TABLE "campaign_schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "campaign_name" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_schedules_school_id_idx" ON "campaign_schedules"("school_id");

-- CreateIndex
CREATE INDEX "campaign_schedules_fiscal_period_id_idx" ON "campaign_schedules"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_schedules_school_id_fiscal_period_id_key" ON "campaign_schedules"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "campaign_schedules" ADD CONSTRAINT "campaign_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_schedules" ADD CONSTRAINT "campaign_schedules_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_schedules" ADD CONSTRAINT "campaign_schedules_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
