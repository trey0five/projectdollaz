-- AIC Phase E — notification bookkeeping on the findings ledger.
-- STRICTLY ADDITIVE. Safe to `prisma migrate deploy` while the previous image is
-- still serving: nothing in the running code selects these columns, and every one
-- of them has a default or is nullable.
--
-- WHY THREE COLUMNS AND NOT ONE: "re-notifies exactly once" is three distinct
-- edges (a re-arm, an escalation, a mute lapsing) and each needs its own watermark.
-- Folding them into lastNotifiedAt alone makes de-escalation indistinguishable from
-- escalation, which is exactly the noise this design refuses to ship.
--
-- ZERO DML. No backfill, no COALESCE, no functional index: `notified_reopen_count`
-- defaults to 0 (which is correct for every existing row — none has been notified),
-- and `notified_severity` NULL reads as "never notified at any severity", which the
-- policy already treats as the lowest rung.
--
-- NO FOREIGN KEY on `acked_by_user_id`, for the same reason `initiative_id` has
-- none: it is bookkeeping, the audit log is the record of record, and a relation
-- here would make a user deletion a two-phase coordination.
ALTER TABLE "accreditation_findings"
  ADD COLUMN "notified_reopen_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notified_severity"     TEXT,
  ADD COLUMN "acked_by_user_id"      UUID;

-- Every Phase-E read model filters `cleared_at IS NULL` inside one school.
CREATE INDEX "accreditation_findings_school_id_cleared_at_idx"
  ON "accreditation_findings"("school_id", "cleared_at");
