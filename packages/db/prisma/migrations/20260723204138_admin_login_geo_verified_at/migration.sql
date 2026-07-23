-- AlterTable
ALTER TABLE "governance_committees" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "governance_meetings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "last_login_city" TEXT,
ADD COLUMN     "last_login_country" TEXT,
ADD COLUMN     "last_login_ip" TEXT,
ADD COLUMN     "last_login_lat" DOUBLE PRECISION,
ADD COLUMN     "last_login_lon" DOUBLE PRECISION,
ADD COLUMN     "last_login_region" TEXT;

-- CreateTable
CREATE TABLE "user_login_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ip" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_login_events_user_id_idx" ON "user_login_events"("user_id");

-- CreateIndex
CREATE INDEX "user_login_events_region_idx" ON "user_login_events"("region");

-- CreateIndex
CREATE INDEX "user_login_events_created_at_idx" ON "user_login_events"("created_at");

-- CreateIndex
CREATE INDEX "users_last_login_region_idx" ON "users"("last_login_region");

-- AddForeignKey
ALTER TABLE "user_login_events" ADD CONSTRAINT "user_login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
