-- AIC Phase B — the seed-only DOMAIN MAP on the platform catalog (strictly
-- additive: three nullable/defaulted columns, no backfill, no DML, no new table,
-- no index). Safe to `prisma migrate deploy` against the live DB while the
-- previous image is still serving: the old code simply never selects them.
--
-- WHY NO BACKFILL: the values are SEED data, not tenant data. The boot-time
-- catalog upsert (AccreditationCatalogService.seedFramework) writes them into
-- `nodeData`, so the FIRST BOOT of the Phase-B image populates every existing
-- production catalog row through the ordinary update path. A backfill here would
-- be a second, drifting source of the same truth.
--
-- House convention: TEXT, not a PG enum — the closed vocabulary is enforced by
-- @finrep/compliance DOMAIN_KEYS + a seed spec, exactly like reason/series_key.
--
-- DEPLOY ORDER: migrate → verify the three columns → roll the image. Never roll
-- the migration BACK ahead of the image. Four read sites now select these
-- columns, including the pre-existing standards register; the reverse ordering
-- would otherwise 42703 the whole accreditation module and not just the new
-- grid. Belt and braces: those reads go through readCatalogDomainRows(), which
-- degrades a missing-column error to the Phase-A assurance-only select, so a
-- mis-ordered deploy loses the domain grid rather than the register.
ALTER TABLE "accreditation_catalog_standards" ADD COLUMN     "domain_key" TEXT,
ADD COLUMN     "domain_weights" JSONB,
ADD COLUMN     "signal_keys" TEXT[] NOT NULL DEFAULT '{}';
