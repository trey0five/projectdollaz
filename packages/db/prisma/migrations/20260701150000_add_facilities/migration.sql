-- Phase 4 Facilities v1 — the deferred-maintenance register.
-- ADDITIVE: one brand-new table + one index + two FKs. Touches NO existing row or
-- column, so it is safe to `prisma migrate deploy` against the live DB. Timestamp
-- sorts AFTER 20260701140000_add_evidence_source (the latest migration). The school
-- FK cascades on tenant delete; the created-by user FK sets null on user delete.
-- SEPARATE from capital_schedules (no FK / no rollup) — linkage deferred.
-- Mirrors the accreditation migration conventions.

-- CreateTable
CREATE TABLE "maintenance_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "estimated_cost" DECIMAL(14,2),
    "target_date" DATE,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_items_school_id_idx" ON "maintenance_items"("school_id");

-- AddForeignKey
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_items" ADD CONSTRAINT "maintenance_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
