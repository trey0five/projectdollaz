-- AlterTable
ALTER TABLE "period_operational_data" ADD COLUMN     "act_score_sum" INTEGER,
ADD COLUMN     "act_tested_count" INTEGER,
ADD COLUMN     "assessment_eligible_count" INTEGER,
ADD COLUMN     "benchmark_met_count" INTEGER,
ADD COLUMN     "benchmark_tested_count" INTEGER,
ADD COLUMN     "sat_score_sum" INTEGER,
ADD COLUMN     "sat_tested_count" INTEGER;

-- CreateTable
CREATE TABLE "assessment_imports" (
    "id" UUID NOT NULL,
    "school_id" UUID,
    "organization_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'upload',
    "provider" TEXT,
    "scope" TEXT NOT NULL,
    "file_name" TEXT,
    "test_type_hint" TEXT,
    "year_hint" INTEGER,
    "rows_parsed" INTEGER NOT NULL DEFAULT 0,
    "results_created" INTEGER NOT NULL DEFAULT 0,
    "aggregates_upserted" INTEGER NOT NULL DEFAULT 0,
    "students_matched" INTEGER NOT NULL DEFAULT 0,
    "students_unmatched" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "import_id" UUID,
    "student_id" UUID,
    "match_status" TEXT NOT NULL DEFAULT 'unmatched',
    "match_external_id" TEXT,
    "match_name" TEXT,
    "test_type" TEXT NOT NULL,
    "school_year" INTEGER NOT NULL,
    "test_date" DATE,
    "grade_level" TEXT,
    "composite" INTEGER,
    "section_scores" JSONB,
    "benchmarks_met" JSONB,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_school_aggregates" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "import_id" UUID,
    "school_year" INTEGER NOT NULL,
    "test_type" TEXT NOT NULL,
    "grade_level" TEXT NOT NULL DEFAULT 'all',
    "derivation" TEXT NOT NULL,
    "tested_count" INTEGER,
    "eligible_count" INTEGER,
    "avg_composite" DECIMAL(6,2),
    "section_averages" JSONB,
    "benchmark_met_count" INTEGER,
    "benchmark_rates" JSONB,
    "participation_rate" DECIMAL(5,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_school_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "grade_level" TEXT,
    "term" TEXT,
    "school_year" INTEGER,
    "teacher_name" TEXT,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_records" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "course_id" UUID,
    "student_id" UUID,
    "import_id" UUID,
    "match_status" TEXT NOT NULL DEFAULT 'unmatched',
    "match_external_id" TEXT,
    "match_name" TEXT,
    "school_year" INTEGER,
    "term" TEXT,
    "numeric_grade" DECIMAL(5,2),
    "letter_grade" TEXT,
    "external_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "grade_level" TEXT,
    "teacher_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "planned_on" DATE,
    "week_of" DATE,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_imports_school_id_created_at_idx" ON "assessment_imports"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "assessment_imports_organization_id_created_at_idx" ON "assessment_imports"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "assessment_results_school_id_test_type_school_year_idx" ON "assessment_results"("school_id", "test_type", "school_year");

-- CreateIndex
CREATE INDEX "assessment_results_student_id_idx" ON "assessment_results"("student_id");

-- CreateIndex
CREATE INDEX "assessment_results_import_id_idx" ON "assessment_results"("import_id");

-- CreateIndex
CREATE INDEX "assessment_school_aggregates_school_id_school_year_idx" ON "assessment_school_aggregates"("school_id", "school_year");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_school_aggregates_school_id_school_year_test_typ_key" ON "assessment_school_aggregates"("school_id", "school_year", "test_type", "grade_level", "derivation");

-- CreateIndex
CREATE INDEX "courses_school_id_school_year_idx" ON "courses"("school_id", "school_year");

-- CreateIndex
CREATE UNIQUE INDEX "courses_school_id_external_id_key" ON "courses"("school_id", "external_id");

-- CreateIndex
CREATE INDEX "grade_records_school_id_school_year_idx" ON "grade_records"("school_id", "school_year");

-- CreateIndex
CREATE INDEX "grade_records_course_id_idx" ON "grade_records"("course_id");

-- CreateIndex
CREATE INDEX "grade_records_student_id_idx" ON "grade_records"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_records_school_id_external_id_key" ON "grade_records"("school_id", "external_id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_status_idx" ON "lesson_plans"("school_id", "status");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_week_of_idx" ON "lesson_plans"("school_id", "week_of");

-- AddForeignKey
ALTER TABLE "assessment_imports" ADD CONSTRAINT "assessment_imports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_imports" ADD CONSTRAINT "assessment_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_imports" ADD CONSTRAINT "assessment_imports_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "assessment_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_school_aggregates" ADD CONSTRAINT "assessment_school_aggregates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_school_aggregates" ADD CONSTRAINT "assessment_school_aggregates_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "assessment_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "assessment_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

