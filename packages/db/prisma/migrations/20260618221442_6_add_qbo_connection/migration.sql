-- CreateTable
CREATE TABLE "qbo_connections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "realm_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "connected_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qbo_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qbo_connections_school_id_key" ON "qbo_connections"("school_id");

-- AddForeignKey
ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
