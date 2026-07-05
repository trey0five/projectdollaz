-- Store the QuickBooks company display name (CompanyInfo.CompanyName) so the UI can
-- show a human company name instead of the raw numeric realmId. Nullable + additive:
-- existing connections are backfilled lazily by QboService.status().
ALTER TABLE "qbo_connections" ADD COLUMN "company_name" TEXT;
