-- AlterTable
ALTER TABLE "accreditation_frameworks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "facilities_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "governance_committee_memberships" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "governance_people" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "maintenance_bids" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "cash_commitments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "confidence" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "day_rule" JSONB,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_assumptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "plan_mix" JSONB NOT NULL,
    "collection_rate" DECIMAL(5,4) NOT NULL,
    "collection_rate_source" TEXT NOT NULL DEFAULT 'entered',
    "reserve_threshold" DECIMAL(14,2),
    "first_billing_date" DATE,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_projection_runs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "horizon_end" DATE NOT NULL,
    "granularity" TEXT NOT NULL,
    "opening_cash" DECIMAL(14,2) NOT NULL,
    "opening_source" TEXT NOT NULL,
    "tb_cash_at_as_of" DECIMAL(14,2),
    "assumptions" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "dataTier" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_projection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_commitments_school_id_idx" ON "cash_commitments"("school_id");

-- CreateIndex
CREATE INDEX "cash_commitments_school_id_active_idx" ON "cash_commitments"("school_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "cash_assumptions_school_id_key" ON "cash_assumptions"("school_id");

-- CreateIndex
CREATE INDEX "cash_projection_runs_school_id_as_of_date_idx" ON "cash_projection_runs"("school_id", "as_of_date");

-- CreateIndex
CREATE INDEX "cash_projection_runs_school_id_created_at_idx" ON "cash_projection_runs"("school_id", "created_at");

-- AddForeignKey
ALTER TABLE "cash_commitments" ADD CONSTRAINT "cash_commitments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_assumptions" ADD CONSTRAINT "cash_assumptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_projection_runs" ADD CONSTRAINT "cash_projection_runs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_projection_runs" ADD CONSTRAINT "cash_projection_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
