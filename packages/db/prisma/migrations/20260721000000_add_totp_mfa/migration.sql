-- User TOTP columns (all nullable/defaulted; no lockout of existing users)
ALTER TABLE "users"
  ADD COLUMN "totp_enabled"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "totp_secret_enc"         TEXT,
  ADD COLUMN "totp_pending_secret_enc" TEXT,
  ADD COLUMN "totp_pending_expires_at" TIMESTAMP(3),
  ADD COLUMN "totp_enrolled_at"        TIMESTAMP(3),
  ADD COLUMN "totp_last_used_step"     BIGINT;

-- Backup codes: sha256hex only, single-use via used_at
CREATE TABLE "mfa_backup_codes" (
  "id"         UUID NOT NULL,
  "user_id"    UUID NOT NULL,
  "code_hash"  TEXT NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mfa_backup_codes_user_id_idx" ON "mfa_backup_codes"("user_id");
ALTER TABLE "mfa_backup_codes"
  ADD CONSTRAINT "mfa_backup_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Login challenges: jti-keyed, hash-at-rest, attempt-capped, single-use
CREATE TABLE "mfa_challenges" (
  "id"          UUID NOT NULL,
  "user_id"     UUID NOT NULL,
  "jti"         TEXT NOT NULL,
  "token_hash"  TEXT NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "expires_at"  TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mfa_challenges_jti_key" ON "mfa_challenges"("jti");
CREATE INDEX "mfa_challenges_user_id_idx" ON "mfa_challenges"("user_id");
ALTER TABLE "mfa_challenges"
  ADD CONSTRAINT "mfa_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
