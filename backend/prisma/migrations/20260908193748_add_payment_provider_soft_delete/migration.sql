-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_payment_providers_deleted_at" ON "payment_providers"("deleted_at");
