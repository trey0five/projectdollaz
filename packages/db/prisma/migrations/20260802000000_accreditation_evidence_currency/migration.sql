-- AIC Phase C — evidence currency + the sparse requirement catalog. STRICTLY
-- ADDITIVE: one new table, four nullable columns on accreditation_evidence, one
-- DEFAULTED column on accreditation_readiness_snapshots. No backfill, no DML, no
-- functional index, no COALESCE. Safe to `prisma migrate deploy` while the
-- previous image is still serving — the old code never selects any of them.
--
-- WHY NO BACKFILL ANYWHERE:
--   * requirement rows are SEED data — the boot-time upsert (pass 3 in
--     AccreditationCatalogService.seedFramework) populates them on the first boot
--     of this image, exactly like the Phase-B domain map. A DML backfill here
--     would be a second, drifting source of the same truth.
--   * evidence.effective_date is a FACT ONLY THE SCHOOL KNOWS. Deriving it from
--     created_at or captured_at would be the exact guess this phase exists to ban.
--   * verified_basis DEFAULT 'exists' makes every already-recorded snapshot
--     self-describing, which is what produces exactly one honest series break.
--
-- House conventions honoured: TEXT + DTO/seed-spec @IsIn rather than a PG enum
-- (window_kind, data_availability, source_register, tag, verified_basis);
-- @db.Date UTC-midnight discipline on the two date columns; ON DELETE CASCADE
-- from the platform catalog (requirements are reference data, not tenant data).

CREATE TABLE "accreditation_catalog_requirements" (
    "id"                  UUID         NOT NULL,
    "catalog_standard_id" UUID         NOT NULL,
    "tag"                 TEXT         NOT NULL,
    "label"               TEXT         NOT NULL,
    "window_months"       INTEGER,
    "window_kind"         TEXT         NOT NULL DEFAULT 'fixed',
    "data_availability"   TEXT         NOT NULL DEFAULT 'platform',
    "source_register"     TEXT,
    "not_tracked_reason"  TEXT,
    "order_index"         INTEGER      NOT NULL DEFAULT 0,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accreditation_catalog_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accreditation_catalog_requirements_catalog_standard_id_tag_key"
    ON "accreditation_catalog_requirements"("catalog_standard_id", "tag");
CREATE INDEX "accreditation_catalog_requirements_catalog_standard_id_idx"
    ON "accreditation_catalog_requirements"("catalog_standard_id");

ALTER TABLE "accreditation_catalog_requirements"
    ADD CONSTRAINT "accreditation_catalog_requirements_catalog_standard_id_fkey"
    FOREIGN KEY ("catalog_standard_id")
    REFERENCES "accreditation_catalog_standards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accreditation_evidence"
    ADD COLUMN "tag"            TEXT,
    ADD COLUMN "effective_date" DATE,
    ADD COLUMN "expires_at"     DATE,
    ADD COLUMN "also_in_portal" BOOLEAN;

ALTER TABLE "accreditation_readiness_snapshots"
    ADD COLUMN "verified_basis" TEXT NOT NULL DEFAULT 'exists';
