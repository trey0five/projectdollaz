-- AlterTable: add per-school beginning net-asset balances (engine inputs).
-- Defaults of 0 let `migrate deploy` apply cleanly over existing rows; the seed
-- and POST /schools set real values.
ALTER TABLE "schools" ADD COLUMN "net_assets_begin" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "schools" ADD COLUMN "py_net_assets_begin" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "schools" ADD COLUMN "audit_net_assets_begin" DECIMAL(18,2) NOT NULL DEFAULT 0;
