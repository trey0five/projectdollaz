-- Phase 4 Knowledge document store — additive one-table register + 2 indexes + 2 FKs.
-- Timestamp sorts AFTER the highest existing 20260701160000_add_advancement.
-- Touches no existing row/column; safe for `prisma migrate deploy` on the live DB.
-- School CASCADE (docs die with the school); uploader SET NULL (keep the doc if the
-- user is removed). tags String[] -> text[] with an empty-array default.

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_ref" UUID,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_s3_key_key" ON "knowledge_documents"("s3_key");

-- CreateIndex
CREATE INDEX "knowledge_documents_school_id_idx" ON "knowledge_documents"("school_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_school_id_source_ref_idx" ON "knowledge_documents"("school_id", "source_ref");

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
