-- Phase 4 Accreditation — auto-link evidence from operations.
-- ADDITIVE: two nullable/defaulted columns on accreditation_evidence. Every existing
-- row defaults source_type='manual', source_ref NULL — no backfill, safe for
-- `prisma migrate deploy` against the live DB. Mirrors the Task.source_type/source_ref
-- soft-link precedent (no FK — heterogeneous targets: a Policy id or a BoardReport id).
ALTER TABLE "accreditation_evidence" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "accreditation_evidence" ADD COLUMN "source_ref" UUID;
