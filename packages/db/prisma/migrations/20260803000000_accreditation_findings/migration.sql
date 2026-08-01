-- AIC Phase D — the findings ledger. STRICTLY ADDITIVE: one new table, one FK,
-- four indexes. No column is added to, or altered on, any existing table. No
-- backfill, no DML, no functional index, no null-coalescing expression. Safe to
-- `prisma migrate deploy` while the previous image is still serving: nothing in
-- the running code selects this table.
--
-- WHY NO BACKFILL: there is no history to reconstruct. Findings begin the night
-- the first rule ships (Phase E). Manufacturing rows for facts nobody evaluated
-- would be the retroactive-history invention this program bans.
--
-- WHY NO FK ON initiative_id: the improvement model is renamed in Phase G
-- (StrategyInitiative -> ImprovementInitiative, @@map unchanged). Planting a
-- relation here would make a zero-DDL rename into a two-phase coordination.

CREATE TABLE "accreditation_findings" (
    "id"                  UUID         NOT NULL,
    "school_id"           UUID         NOT NULL,
    "rule_id"             TEXT         NOT NULL,
    "scope_key"           TEXT         NOT NULL,
    "finding_key"         TEXT         NOT NULL,
    "fact_key"            TEXT         NOT NULL,
    -- Prisma emits scalar lists WITHOUT NOT NULL (the client type is already
    -- non-nullable); matched byte-for-byte so a later `migrate diff` reports no drift.
    "standard_tags"       TEXT[]       DEFAULT ARRAY[]::TEXT[],
    "domain_keys"         TEXT[]       DEFAULT ARRAY[]::TEXT[],
    "primary_domain_key"  TEXT         NOT NULL,
    "severity"            TEXT         NOT NULL,
    "status"              TEXT         NOT NULL DEFAULT 'open',
    "likelihood"          TEXT,
    "confidence"          TEXT         NOT NULL DEFAULT 'insufficient',
    "horizon_kind"        TEXT         NOT NULL DEFAULT 'none',
    "horizon_date"        DATE,
    "horizon_periods"     INTEGER,
    "horizon_confidence"  TEXT,
    "first_seen_at"       TIMESTAMP(3) NOT NULL,
    "last_seen_at"        TIMESTAMP(3) NOT NULL,
    "cleared_at"          TIMESTAMP(3),
    "resolution_kind"     TEXT,
    "reopen_count"        INTEGER      NOT NULL DEFAULT 0,
    "evidence_payload"    JSONB        NOT NULL,
    "payload_hash"        TEXT         NOT NULL,
    "initiative_id"       UUID,
    "muted_reason"        TEXT,
    "muted_until"         TIMESTAMP(3),
    "acked_until"         TIMESTAMP(3),
    "last_notified_at"    TIMESTAMP(3),
    "is_demo"             BOOLEAN      NOT NULL DEFAULT false,
    "engine_version"      TEXT         NOT NULL,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accreditation_findings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accreditation_findings_school_id_rule_id_scope_key_key"
    ON "accreditation_findings"("school_id", "rule_id", "scope_key");
CREATE INDEX "accreditation_findings_school_id_status_idx"
    ON "accreditation_findings"("school_id", "status");
CREATE INDEX "accreditation_findings_school_id_fact_key_idx"
    ON "accreditation_findings"("school_id", "fact_key");
CREATE INDEX "accreditation_findings_school_id_last_seen_at_idx"
    ON "accreditation_findings"("school_id", "last_seen_at");

ALTER TABLE "accreditation_findings"
    ADD CONSTRAINT "accreditation_findings_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
