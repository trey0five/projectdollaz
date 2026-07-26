-- Phase 5 — Student roster (the school's own system of record when no SIS).
-- DATA-MINIMAL by design (FERPA): no SSN/address/phone/email/guardian/medical
-- text columns exist AT ALL. Support needs are coarse booleans (has_iep/has_504/
-- ell), never diagnosis text. grade/status/gender/race/ethnicity are TEXT bounded
-- by DTO @IsIn lists, NOT Postgres enums (house convention — cheap migrations).
-- Hard delete is allowed (school data stewardship) — no soft-delete PII shadow.

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "gender" TEXT,
    "race" TEXT,
    "ethnicity" TEXT,
    "birth_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'enrolled',
    "enrolled_on" DATE,
    "withdrawn_on" DATE,
    "has_iep" BOOLEAN NOT NULL DEFAULT false,
    "has_504" BOOLEAN NOT NULL DEFAULT false,
    "ell" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "external_id" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent re-import by OneRoster sourcedId; '' is normalized to NULL
-- in the service so the unique never trips on blanks — NULLs are distinct in PG).
CREATE UNIQUE INDEX "students_school_id_external_id_key" ON "students"("school_id", "external_id");

-- CreateIndex
CREATE INDEX "students_school_id_status_idx" ON "students"("school_id", "status");

-- CreateIndex
CREATE INDEX "students_school_id_grade_idx" ON "students"("school_id", "grade");

-- CreateIndex
CREATE INDEX "students_school_id_last_name_first_name_idx" ON "students"("school_id", "last_name", "first_name");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
