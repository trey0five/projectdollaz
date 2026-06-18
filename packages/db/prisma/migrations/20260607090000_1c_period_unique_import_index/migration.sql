-- Phase 1C — ADDITIVE ONLY (no columns, no data change).
--
-- (1) DB-level idempotency for fiscal-period create-or-get: a period's natural
--     key is (school, period-end, type). A unique index lets concurrent
--     create-or-get calls collapse to one row safely.
CREATE UNIQUE INDEX "fiscal_periods_school_id_period_end_date_period_type_key"
  ON "fiscal_periods" ("school_id", "period_end_date", "period_type");

-- (2) Fast latest-active-per-role lookups for comparative resolution.
CREATE INDEX "imports_fiscal_period_id_role_created_at_idx"
  ON "imports" ("fiscal_period_id", "role", "created_at");
