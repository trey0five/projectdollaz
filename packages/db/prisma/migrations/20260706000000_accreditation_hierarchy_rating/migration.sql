-- Phase 4 Accreditation depth — NESTED standard hierarchy (self-relation) + a
-- per-standard met/partial/not-met RATING.
-- ADDITIVE: parent_id is nullable and rating carries a DEFAULT, so every existing row
-- stays valid with NO backfill (existing flat standards read as top-level, unrated).
-- Touches NO existing row/column data, so it is safe to `prisma migrate deploy` against
-- the live DB. Timestamp sorts AFTER 20260705000000_facilities_maintenance_depth (the
-- latest migration). The self-referential FK is ON DELETE SET NULL — deleting a parent
-- RE-PARENTS its children to top-level (parent_id → NULL) rather than cascade-deleting a
-- whole subtree, the safe rule against accidental mass-delete. Mirrors the additive
-- ALTER-TABLE conventions of the facilities depth migration.
ALTER TABLE "accreditation_standards" ADD COLUMN "parent_id" UUID;
ALTER TABLE "accreditation_standards" ADD COLUMN "rating" TEXT NOT NULL DEFAULT 'not_started';

-- Hierarchy lookups (a parent's children) stay school-scoped.
CREATE INDEX "accreditation_standards_school_id_parent_id_idx" ON "accreditation_standards" ("school_id", "parent_id");

-- Self-relation FK: a child points at its parent standard. SET NULL on delete.
ALTER TABLE "accreditation_standards" ADD CONSTRAINT "accreditation_standards_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accreditation_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
