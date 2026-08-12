-- AlterTable
ALTER TABLE "assessment_results" ADD COLUMN     "score_type" TEXT NOT NULL DEFAULT 'scale';

-- AlterTable
ALTER TABLE "assessment_school_aggregates" ADD COLUMN     "distribution" JSONB,
ADD COLUMN     "score_type" TEXT NOT NULL DEFAULT 'scale';

-- CreateTable
CREATE TABLE "assessment_objective_aggregates" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "import_id" UUID,
    "school_year" INTEGER NOT NULL,
    "test_type" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL DEFAULT 'all',
    "subject" TEXT NOT NULL,
    "objective_code" TEXT,
    "objective_label" TEXT NOT NULL,
    "opi" DECIMAL(5,2),
    "mastery_counts" JSONB,
    "tested_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_objective_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_objective_aggregates_school_id_school_year_subje_idx" ON "assessment_objective_aggregates"("school_id", "school_year", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_objective_aggregates_school_id_school_year_test__key" ON "assessment_objective_aggregates"("school_id", "school_year", "test_type", "grade_level", "subject", "objective_label");

-- AddForeignKey
ALTER TABLE "assessment_objective_aggregates" ADD CONSTRAINT "assessment_objective_aggregates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_objective_aggregates" ADD CONSTRAINT "assessment_objective_aggregates_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "assessment_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

