-- Phase 2 Enrollment Intelligence — SIS/roster connector + append-only snapshot series.
-- ADDITIVE: one new enum, two brand-new tables, and two nullable columns on
-- period_operational_data (both nullable, no DEFAULT needed since NULL is the "not set"
-- state the promote/metric paths already expect). Touches NO existing row or column
-- data, so it is safe to `prisma migrate deploy` against the live DB. Timestamp sorts
-- AFTER 20260709000000_add_org_qbo_company (the latest migration). enrollment_sources
-- is one-per-school (unique school_id, mirrors qbo_connections); enrollment_snapshots is
-- an immutable DATED series with an idempotent (school, source, observed_on) unique so a
-- re-import upserts. FKs cascade on school delete; source_id / fiscal_period_id / created
-- -by user all SET NULL so a CSV/manual snapshot survives a connector or user removal.

-- CreateEnum
CREATE TYPE "EnrollmentProvider" AS ENUM ('oneroster_csv', 'oneroster_api', 'blackbaud', 'facts', 'veracross', 'manual');

-- AlterTable
ALTER TABLE "period_operational_data" ADD COLUMN     "enrollment_source_provider" TEXT,
ADD COLUMN     "planned_enrollment_by_grade" JSONB;

-- CreateTable
CREATE TABLE "enrollment_sources" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "provider" "EnrollmentProvider" NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "api_key_id" TEXT,
    "api_key_secret" TEXT,
    "base_url" TEXT,
    "external_org_id" TEXT,
    "subscription_key" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "config" JSONB,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "last_error" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "connected_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_snapshots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "source_id" UUID,
    "fiscal_period_id" UUID,
    "observed_on" DATE NOT NULL,
    "provider" "EnrollmentProvider" NOT NULL,
    "total_enrolled" INTEGER NOT NULL,
    "by_grade" JSONB NOT NULL,
    "by_status" JSONB,
    "fte" DECIMAL(10,2),
    "raw" JSONB,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_sources_school_id_key" ON "enrollment_sources"("school_id");

-- CreateIndex
CREATE INDEX "enrollment_snapshots_school_id_observed_on_idx" ON "enrollment_snapshots"("school_id", "observed_on");

-- CreateIndex
CREATE INDEX "enrollment_snapshots_fiscal_period_id_idx" ON "enrollment_snapshots"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_snapshots_school_id_source_id_observed_on_key" ON "enrollment_snapshots"("school_id", "source_id", "observed_on");

-- AddForeignKey
ALTER TABLE "enrollment_sources" ADD CONSTRAINT "enrollment_sources_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_snapshots" ADD CONSTRAINT "enrollment_snapshots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_snapshots" ADD CONSTRAINT "enrollment_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "enrollment_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_snapshots" ADD CONSTRAINT "enrollment_snapshots_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_snapshots" ADD CONSTRAINT "enrollment_snapshots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
