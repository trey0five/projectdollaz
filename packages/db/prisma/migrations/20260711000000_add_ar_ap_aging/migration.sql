-- AR/AP aging "Cash & Collections" — additive dated snapshot table.
-- ADDITIVE: one brand-new table + one unique + one index + one FK. Touches NO
-- existing row or column, so it is safe to `prisma migrate deploy` against the live
-- DB. Timestamp sorts AFTER 20260710000000_add_enrollment (the latest migration).
-- Keyed by (school_id, as_of_date) UNIQUE so a same-day re-capture UPSERTS
-- (idempotent). The briefing reads the latest row via the (school_id, captured_at)
-- index. FK cascades on school delete (same as every other per-school table).

-- CreateTable
CREATE TABLE "ar_ap_aging_snapshots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "realm_id" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "source" TEXT NOT NULL DEFAULT 'aging-detail',
    "captured_via" TEXT NOT NULL,
    "ar_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ar_overdue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ar_90_plus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ap_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ap_overdue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ap_due_soon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ar_accounts" INTEGER NOT NULL DEFAULT 0,
    "ar_90_count" INTEGER NOT NULL DEFAULT 0,
    "ap_vendors" INTEGER NOT NULL DEFAULT 0,
    "ar_buckets" JSONB NOT NULL,
    "ap_buckets" JSONB NOT NULL,
    "ar_top" JSONB NOT NULL,
    "ap_top" JSONB NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ar_ap_aging_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ar_ap_aging_snapshots_school_id_captured_at_idx" ON "ar_ap_aging_snapshots"("school_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "ar_ap_aging_snapshots_school_id_as_of_date_key" ON "ar_ap_aging_snapshots"("school_id", "as_of_date");

-- AddForeignKey
ALTER TABLE "ar_ap_aging_snapshots" ADD CONSTRAINT "ar_ap_aging_snapshots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
