-- The receipt for a roster intake: which file produced the enrollment numbers,
-- and what it actually wrote to the student register.
-- ADDITIVE ONLY. One new table, no column added to an existing one, ZERO DML.
-- Migrations run on container boot in production.

CREATE TABLE "enrollment_imports" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'upload',
    "provider" TEXT,
    "file_name" TEXT,
    "observed_on" DATE,
    "total_counted" INTEGER NOT NULL DEFAULT 0,
    "records_created" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_deleted" INTEGER NOT NULL DEFAULT 0,
    "records_note" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "enrollment_imports_school_id_created_at_idx" ON "enrollment_imports"("school_id", "created_at");

ALTER TABLE "enrollment_imports" ADD CONSTRAINT "enrollment_imports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enrollment_imports" ADD CONSTRAINT "enrollment_imports_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
