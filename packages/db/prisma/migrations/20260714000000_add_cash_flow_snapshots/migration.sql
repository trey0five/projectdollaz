-- Live cash-flow + reconciliation "trust check" — additive period-scoped snapshot.
-- ADDITIVE: one brand-new table + one unique + one index + one FK. Touches NO
-- existing row or column, so it is safe to `prisma migrate deploy` against the live
-- DB. Timestamp sorts AFTER 20260713000000_snapshot_provenance (the latest migration).
-- Keyed by (school_id, fiscal_period_id) UNIQUE so a same-period re-capture UPSERTS
-- (idempotent). The briefing reads the latest row via the (school_id, captured_at)
-- index. FK cascades on school delete (same as every other per-school table).

-- CreateTable
CREATE TABLE "cash_flow_snapshots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "realm_id" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "source" TEXT NOT NULL DEFAULT 'cashflow',
    "captured_via" TEXT NOT NULL,
    "operating" DOUBLE PRECISION,
    "investing" DOUBLE PRECISION,
    "financing" DOUBLE PRECISION,
    "net_change" DOUBLE PRECISION,
    "opening_cash" DOUBLE PRECISION,
    "monthly_burn" DOUBLE PRECISION,
    "runway_months" DOUBLE PRECISION,
    "recon_status" TEXT NOT NULL DEFAULT 'unknown',
    "cash_diff" DOUBLE PRECISION,
    "net_income_diff" DOUBLE PRECISION,
    "cash_change_diff" DOUBLE PRECISION,
    "cash_tie" BOOLEAN,
    "net_income_tie" BOOLEAN,
    "detail" JSONB,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_flow_snapshots_school_id_captured_at_idx" ON "cash_flow_snapshots"("school_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_snapshots_school_id_fiscal_period_id_key" ON "cash_flow_snapshots"("school_id", "fiscal_period_id");

-- AddForeignKey
ALTER TABLE "cash_flow_snapshots" ADD CONSTRAINT "cash_flow_snapshots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
