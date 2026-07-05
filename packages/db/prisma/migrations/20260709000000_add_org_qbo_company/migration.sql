-- Diocesan QuickBooks (Topology B) — ONE QuickBooks company for the whole
-- organization, split by Location (QBO API: Department) or Class. Two NEW,
-- self-contained tables; ADDITIVE (no existing row or column touched), so it is
-- safe to `prisma migrate deploy` against the live DB. Timestamp sorts AFTER
-- 20260708000000_qbo_company_name (the latest migration). Conventions match
-- add_qbo_connection / proactive_alerts: app-generated UUID id (no DB default),
-- CASCADE FKs (mappings die with their connection; a deleted school drops its
-- mapping rows, never the connection), unique one-connection-per-org, and a
-- school_id index for the "is this school org-fed?" lookup on every status read.

-- CreateTable
CREATE TABLE "org_qbo_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "realm_id" TEXT NOT NULL,
    "company_name" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "dimension" TEXT NOT NULL DEFAULT 'department',
    "connected_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_qbo_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_qbo_mappings" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "dimension" TEXT NOT NULL,
    "qbo_id" TEXT NOT NULL,
    "qbo_name" TEXT NOT NULL,
    "school_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_qbo_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_qbo_connections_organization_id_key" ON "org_qbo_connections"("organization_id");

-- CreateIndex
CREATE INDEX "org_qbo_mappings_school_id_idx" ON "org_qbo_mappings"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_qbo_mappings_connection_id_dimension_qbo_id_key" ON "org_qbo_mappings"("connection_id", "dimension", "qbo_id");

-- AddForeignKey
ALTER TABLE "org_qbo_connections" ADD CONSTRAINT "org_qbo_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_qbo_mappings" ADD CONSTRAINT "org_qbo_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "org_qbo_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_qbo_mappings" ADD CONSTRAINT "org_qbo_mappings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
