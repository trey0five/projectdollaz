-- Governance Phase 2 — PEOPLE + COMMITTEE MEMBERSHIP (additive only).
-- Real-world governance humans (trustees, CFO, business manager) — distinct from
-- auth users (optional user_id link, SET NULL). groups/role are TEXT bounded by
-- the DTO @IsIn lists, NOT Postgres enums (house convention — cheap migrations).

-- CreateTable: governance people register.
CREATE TABLE "governance_people" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "groups" TEXT[] NOT NULL DEFAULT '{}',
    "term_start" DATE,
    "term_end" DATE,
    "email" TEXT,
    "bio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable: committee <-> person join (duplicate membership = DB-level unique violation -> 409).
CREATE TABLE "governance_committee_memberships" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_committee_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_people_school_id_idx" ON "governance_people"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "governance_committee_memberships_committee_id_person_id_key" ON "governance_committee_memberships"("committee_id", "person_id");

-- CreateIndex
CREATE INDEX "governance_committee_memberships_school_id_idx" ON "governance_committee_memberships"("school_id");

-- CreateIndex
CREATE INDEX "governance_committee_memberships_person_id_idx" ON "governance_committee_memberships"("person_id");

-- AddForeignKey
ALTER TABLE "governance_people" ADD CONSTRAINT "governance_people_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_people" ADD CONSTRAINT "governance_people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_people" ADD CONSTRAINT "governance_people_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_committee_memberships" ADD CONSTRAINT "governance_committee_memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_committee_memberships" ADD CONSTRAINT "governance_committee_memberships_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "governance_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_committee_memberships" ADD CONSTRAINT "governance_committee_memberships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "governance_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
