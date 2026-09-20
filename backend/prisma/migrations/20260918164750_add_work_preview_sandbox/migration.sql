-- CreateEnum
CREATE TYPE "preview_status" AS ENUM ('none', 'pending', 'ready', 'failed');

-- AlterTable
ALTER TABLE "work_formats" ADD COLUMN     "previewError" TEXT,
ADD COLUMN     "preview_generated_at" TIMESTAMPTZ(6),
ADD COLUMN     "preview_page_count" INTEGER,
ADD COLUMN     "preview_status" "preview_status" NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "work_preview_pages" (
    "id" UUID NOT NULL,
    "work_format_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_preview_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_preview_pages_format_page" ON "work_preview_pages"("work_format_id", "page_number");

-- AddForeignKey
ALTER TABLE "work_preview_pages" ADD CONSTRAINT "fk_work_preview_pages_format" FOREIGN KEY ("work_format_id") REFERENCES "work_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
