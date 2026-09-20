/*
  Warnings:

  - You are about to drop the column `previewError` on the `work_formats` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "work_formats" DROP COLUMN "previewError",
ADD COLUMN     "preview_error" TEXT;
