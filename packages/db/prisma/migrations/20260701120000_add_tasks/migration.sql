-- Phase 3 Workflow v1 — the generic TASK engine (the other half of Phase 3).
-- ADDITIVE: a brand-new table + two indexes + three FKs. Touches NO existing row
-- or column, so it is safe to `prisma migrate deploy` against the live DB. The
-- school FK cascades on tenant delete; the assignee + created-by FKs set null on
-- user delete (mirrors policies.updated_by_user_id — orphan the ref, keep the row).
-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignee_user_id" UUID,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "source_type" TEXT,
    "source_ref" TEXT,
    "created_by_user_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_school_id_idx" ON "tasks"("school_id");

-- CreateIndex
CREATE INDEX "tasks_school_id_status_idx" ON "tasks"("school_id", "status");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
