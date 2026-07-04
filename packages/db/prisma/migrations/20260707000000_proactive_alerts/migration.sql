-- Phase 4E Proactive alerts / standing requests — a NEW, self-contained table.
-- ADDITIVE: creates one table + its indexes/FKs and touches NO existing row or
-- column, so it is safe to `prisma migrate deploy` against the live DB. Timestamp
-- sorts AFTER 20260706000000_accreditation_hierarchy_rating (the latest migration).
-- Mirrors the CREATE-TABLE conventions of add_advancement: app-generated UUID id
-- (no DB default), school FK ON DELETE CASCADE, creator FK ON DELETE SET NULL, and
-- a school_id index. An extra enabled index speeds the scheduler's runDue() sweep
-- (WHERE enabled = true). recipient_email is NOT NULL — the service stamps the
-- creator's email at create time when the client omits it.

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "type" TEXT NOT NULL,
    "cadence" TEXT,
    "metric_key" TEXT,
    "operator" TEXT,
    "threshold" DOUBLE PRECISION,
    "recipient_email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMP(3),
    "last_value" DOUBLE PRECISION,
    "last_breached" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_school_id_idx" ON "alerts"("school_id");

-- CreateIndex
CREATE INDEX "alerts_enabled_idx" ON "alerts"("enabled");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
