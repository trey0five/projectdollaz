-- AlterTable: add a nullable, unique `jti` to refresh_tokens. The paired access
-- token carries this value as its `sid` claim so activity-touch can target the
-- exact session (precise multi-session accounting). Nullable so `migrate deploy`
-- applies cleanly over existing rows; legacy tokens fall back to most-recent.
ALTER TABLE "refresh_tokens" ADD COLUMN "jti" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");
