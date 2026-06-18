-- CreateTable
CREATE TABLE "report_schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'monthly',
    "recipients" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_sent_at" TIMESTAMP(3),
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_schedules_school_id_key" ON "report_schedules"("school_id");

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
