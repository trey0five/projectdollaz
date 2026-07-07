-- Phase 5 Strategic Planning v1 — the plan → pillar → goal → initiative register
-- (the 7th sellable module, 'strategy'). ADDITIVE: four brand-new tables + indexes
-- + FKs. Touches NO existing row or column, so it is safe to `prisma migrate deploy`
-- against the live DB. Timestamp sorts AFTER 20260714000000_add_cash_flow_snapshots
-- (the latest migration). Every school FK cascades on tenant delete; every user FK
-- sets null on user delete; the plan/pillar/goal parent FKs CASCADE so deleting a
-- plan tears down its whole subtree. All @default columns need NO backfill, so
-- schema.prisma and this DDL stay in lockstep. Mirrors the advancement/accreditation
-- migration conventions.

-- CreateTable
CREATE TABLE "strategic_plans" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mission" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fy_start_year" INTEGER NOT NULL,
    "fy_end_year" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "adopted_at" TIMESTAMP(3),
    "next_review_date" DATE,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategic_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_pillars" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_pillars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_goals" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "pillar_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal_type" TEXT NOT NULL DEFAULT 'metric',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "owner_user_id" UUID,
    "metric_key" TEXT,
    "target_value" DECIMAL(18,6),
    "baseline_value" DECIMAL(18,6),
    "baseline_date" DATE,
    "baseline_metric_period_id" UUID,
    "start_date" DATE,
    "target_date" DATE,
    "manual_progress_pct" DECIMAL(6,4),
    "milestones" JSONB,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_initiatives" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "owner_user_id" UUID,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_initiatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategic_plans_school_id_idx" ON "strategic_plans"("school_id");

-- CreateIndex
CREATE INDEX "strategy_pillars_school_id_idx" ON "strategy_pillars"("school_id");

-- CreateIndex
CREATE INDEX "strategy_pillars_plan_id_idx" ON "strategy_pillars"("plan_id");

-- CreateIndex
CREATE INDEX "strategy_goals_school_id_idx" ON "strategy_goals"("school_id");

-- CreateIndex
CREATE INDEX "strategy_goals_pillar_id_idx" ON "strategy_goals"("pillar_id");

-- CreateIndex
CREATE INDEX "strategy_initiatives_school_id_idx" ON "strategy_initiatives"("school_id");

-- CreateIndex
CREATE INDEX "strategy_initiatives_goal_id_idx" ON "strategy_initiatives"("goal_id");

-- AddForeignKey
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_pillars" ADD CONSTRAINT "strategy_pillars_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_pillars" ADD CONSTRAINT "strategy_pillars_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "strategic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_pillars" ADD CONSTRAINT "strategy_pillars_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_goals" ADD CONSTRAINT "strategy_goals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_goals" ADD CONSTRAINT "strategy_goals_pillar_id_fkey" FOREIGN KEY ("pillar_id") REFERENCES "strategy_pillars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_goals" ADD CONSTRAINT "strategy_goals_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_goals" ADD CONSTRAINT "strategy_goals_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "strategy_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
