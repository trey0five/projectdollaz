-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'accountant', 'viewer');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited');

-- CreateEnum
CREATE TYPE "ImportRole" AS ENUM ('cy', 'py', 'audit');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'none');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "period_end_date" DATE NOT NULL,
    "period_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "password_algo" TEXT,
    "password_iters" INTEGER,
    "password_salt" BYTEA,
    "password_hash" BYTEA,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" TEXT,
    "email_verification_expires_at" TIMESTAMP(3),
    "password_reset_code" TEXT,
    "password_reset_expires_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "invited_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "role" "ImportRole" NOT NULL,
    "source_name" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "metadata" JSONB,
    "row_count" INTEGER NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_chart_versions" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "chart" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standard_chart_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mappings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "entries" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_snapshots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "mapping_version" TEXT NOT NULL,
    "standard_chart_version" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "plan" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'none',
    "current_period_end" TIMESTAMP(3),
    "trial_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "school_id" UUID,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schools_organization_id_idx" ON "schools"("organization_id");

-- CreateIndex
CREATE INDEX "fiscal_periods_school_id_idx" ON "fiscal_periods"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_school_id_idx" ON "memberships"("school_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_school_id_key" ON "memberships"("user_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_school_id_idx" ON "invitations"("school_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "imports_school_id_idx" ON "imports"("school_id");

-- CreateIndex
CREATE INDEX "imports_fiscal_period_id_idx" ON "imports"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "standard_chart_versions_version_key" ON "standard_chart_versions"("version");

-- CreateIndex
CREATE INDEX "mappings_school_id_idx" ON "mappings"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "mappings_school_id_version_key" ON "mappings"("school_id", "version");

-- CreateIndex
CREATE INDEX "statement_snapshots_school_id_idx" ON "statement_snapshots"("school_id");

-- CreateIndex
CREATE INDEX "statement_snapshots_fiscal_period_id_idx" ON "statement_snapshots"("fiscal_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_school_id_key" ON "subscriptions"("school_id");

-- CreateIndex
CREATE INDEX "audit_log_school_id_idx" ON "audit_log"("school_id");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_idx" ON "audit_log"("organization_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mappings" ADD CONSTRAINT "mappings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_snapshots" ADD CONSTRAINT "statement_snapshots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_snapshots" ADD CONSTRAINT "statement_snapshots_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
