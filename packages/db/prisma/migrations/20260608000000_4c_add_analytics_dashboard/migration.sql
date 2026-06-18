-- CreateTable
CREATE TABLE "analytics_dashboard" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "layout" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_dashboard_school_id_key" ON "analytics_dashboard"("school_id");

-- AddForeignKey
ALTER TABLE "analytics_dashboard" ADD CONSTRAINT "analytics_dashboard_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_dashboard" ADD CONSTRAINT "analytics_dashboard_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
