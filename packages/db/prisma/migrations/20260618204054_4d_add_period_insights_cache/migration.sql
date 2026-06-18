-- CreateTable
CREATE TABLE "period_insights" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "period_insights_school_id_fiscal_period_id_key" ON "period_insights"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "period_insights" ADD CONSTRAINT "period_insights_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_insights" ADD CONSTRAINT "period_insights_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
