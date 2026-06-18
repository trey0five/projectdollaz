-- CreateTable
CREATE TABLE "period_corrective_actions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "rule_id" TEXT NOT NULL,
    "observation" TEXT,
    "root_cause" TEXT,
    "corrective_action" TEXT,
    "responsible_party" TEXT,
    "target_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_corrective_actions_school_id_fiscal_period_id_idx" ON "period_corrective_actions"("school_id", "fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_corrective_actions_school_id_fiscal_period_id_rule_i_key" ON "period_corrective_actions"("school_id", "fiscal_period_id", "rule_id");

-- AddForeignKey
ALTER TABLE "period_corrective_actions" ADD CONSTRAINT "period_corrective_actions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_corrective_actions" ADD CONSTRAINT "period_corrective_actions_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_corrective_actions" ADD CONSTRAINT "period_corrective_actions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
