-- Granular diocesan enrollment ingestion. ADDITIVE ONLY: new nullable columns
-- (no backfill), two new enum values, and three new tables. Safe to apply online.

-- ── Enum: diocesan provider tokens ───────────────────────────────────────────
ALTER TYPE "EnrollmentProvider" ADD VALUE IF NOT EXISTS 'diocesan_csv';
ALTER TYPE "EnrollmentProvider" ADD VALUE IF NOT EXISTS 'diocesan_api';

-- ── EnrollmentSnapshot: demographics + manual-supersede flag ─────────────────
ALTER TABLE "enrollment_snapshots"
  ADD COLUMN IF NOT EXISTS "by_demographics" JSONB,
  ADD COLUMN IF NOT EXISTS "superseded_by_import" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "superseded_at" TIMESTAMP(3);

-- ── PeriodOperationalData: reversible manual backup (value + fte + at) ────────
ALTER TABLE "period_operational_data"
  ADD COLUMN IF NOT EXISTS "enrollment_superseded_manual" INTEGER,
  ADD COLUMN IF NOT EXISTS "enrollment_superseded_manual_fte" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "enrollment_superseded_at" TIMESTAMP(3);

-- ── DiocesanEnrollmentImport: durable staging batch ──────────────────────────
CREATE TABLE IF NOT EXISTS "diocesan_enrollment_imports" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "observed_on" DATE,
  "source_shape" TEXT NOT NULL,
  -- No DEFAULT: a newly-added enum value cannot be used as a column default in the
  -- same transaction on Postgres. The service always supplies provider explicitly.
  "provider" "EnrollmentProvider" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reviewing',
  "file_name" TEXT,
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "raw" JSONB,
  "uploaded_by_user_id" UUID,
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diocesan_enrollment_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "diocesan_enrollment_imports_organization_id_status_idx"
  ON "diocesan_enrollment_imports" ("organization_id", "status");

-- ── DiocesanEnrollmentRow: one school's parsed + matched row ─────────────────
CREATE TABLE IF NOT EXISTS "diocesan_enrollment_rows" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "source_name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "matched_school_id" UUID,
  "match_status" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "match_tier" TEXT,
  "candidates" JSONB,
  "total" INTEGER NOT NULL DEFAULT 0,
  "byGrade" JSONB,
  "byStatus" JSONB,
  "byDemographics" JSONB,
  "warnings" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diocesan_enrollment_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "diocesan_enrollment_rows_import_id_idx"
  ON "diocesan_enrollment_rows" ("import_id");

-- ── SchoolNameAlias: learned per-org source-name → school routing ────────────
CREATE TABLE IF NOT EXISTS "school_name_aliases" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "alias" TEXT NOT NULL,
  "school_id" UUID NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'learned',
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_name_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "school_name_aliases_organization_id_alias_key"
  ON "school_name_aliases" ("organization_id", "alias");
CREATE INDEX IF NOT EXISTS "school_name_aliases_organization_id_idx"
  ON "school_name_aliases" ("organization_id");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "diocesan_enrollment_imports"
  ADD CONSTRAINT "diocesan_enrollment_imports_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "diocesan_enrollment_rows"
  ADD CONSTRAINT "diocesan_enrollment_rows_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "diocesan_enrollment_imports" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "school_name_aliases"
  ADD CONSTRAINT "school_name_aliases_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "school_name_aliases"
  ADD CONSTRAINT "school_name_aliases_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
