-- AIC Phase K — Clearance + ProfessionalDevelopment registers.
-- ADDITIVE ONLY. Two new tables, no column added to an existing one, ZERO DML.
-- Migrations run on container boot in production, so nothing here may block on a
-- table scan or rewrite an existing row.

CREATE TABLE "clearances" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "expires_on" DATE,
    "verified_by" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "external_ref" TEXT,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clearances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "professional_development" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "activity_date" DATE NOT NULL,
    "hours" DECIMAL(6,2),
    "category" TEXT NOT NULL DEFAULT 'other',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_development_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clearances_school_id_idx" ON "clearances"("school_id");
CREATE INDEX "clearances_school_id_expires_on_idx" ON "clearances"("school_id", "expires_on");
CREATE INDEX "clearances_person_id_idx" ON "clearances"("person_id");

-- The idempotency key for a re-imported diocesan file. A RENEWAL carries a
-- different issued_on and is correctly a new row, which is what keeps the
-- history a history.
CREATE UNIQUE INDEX "clearances_school_id_person_id_kind_issued_on_key"
    ON "clearances"("school_id", "person_id", "kind", "issued_on");

CREATE INDEX "professional_development_school_id_idx" ON "professional_development"("school_id");
CREATE INDEX "professional_development_school_id_activity_date_idx" ON "professional_development"("school_id", "activity_date");
CREATE INDEX "professional_development_person_id_idx" ON "professional_development"("person_id");

ALTER TABLE "clearances" ADD CONSTRAINT "clearances_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "governance_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "professional_development" ADD CONSTRAINT "professional_development_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_development" ADD CONSTRAINT "professional_development_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "governance_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_development" ADD CONSTRAINT "professional_development_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "professional_development" ADD CONSTRAINT "professional_development_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
