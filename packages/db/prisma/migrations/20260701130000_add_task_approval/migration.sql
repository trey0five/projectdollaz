-- Phase 3 Workflow v1 — approval / sign-off routing (the other half of the
-- governance+workflow pairing). ADDITIVE: five new nullable/defaulted columns +
-- two SET NULL FKs + one index on the existing "tasks" table. Touches NO existing
-- row (approval_status defaults 'none' so every pre-existing task is valid with no
-- backfill), so it is safe to `prisma migrate deploy` against the live DB. The
-- approver + decided-by FKs SET NULL on user delete (mirror tasks_assignee_user_id_fkey
-- — orphan the ref, keep the task + its audit trail). Timestamp is AFTER
-- 20260701120000_add_tasks so it applies against a DB that already has the table.

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "approver_user_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "approval_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "tasks" ADD COLUMN "decided_by_user_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "decided_at" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "decision_note" TEXT;

-- CreateIndex
CREATE INDEX "tasks_school_id_approval_status_idx" ON "tasks"("school_id", "approval_status");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
