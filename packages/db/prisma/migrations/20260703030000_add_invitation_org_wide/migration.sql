-- Org-wide member access: an invitation can grant visibility of EVERY school in
-- the org (+ the consolidated org view) instead of a single school. On accept we
-- fan the membership out across all org schools.
-- ADDITIVE: one boolean column with a false default, so `migrate deploy` applies
-- cleanly over existing rows and existing single-school invites keep their meaning.
-- AlterTable
ALTER TABLE "invitations" ADD COLUMN "org_wide" BOOLEAN NOT NULL DEFAULT false;
