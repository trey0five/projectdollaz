-- Tenant data export jobs. The row outlives the file: the archive expires after
-- a week, but "who took a complete copy of this school's records, and when"
-- is an audit fact that should not.
CREATE TABLE IF NOT EXISTS "data_exports" (
  "id"                   TEXT PRIMARY KEY,
  "school_id"            UUID,
  "organization_id"      UUID,
  "requested_by_user_id" UUID,
  "status"               TEXT NOT NULL DEFAULT 'running',
  "scope"                TEXT NOT NULL DEFAULT 'school',
  "file_key"             TEXT,
  "byte_size"            INTEGER,
  "row_counts"           JSONB,
  "error"                TEXT,
  "expires_at"           TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"         TIMESTAMP(3),
  CONSTRAINT "data_exports_school_id_fkey" FOREIGN KEY ("school_id")
    REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "data_exports_school_id_created_at_idx" ON "data_exports"("school_id", "created_at");
