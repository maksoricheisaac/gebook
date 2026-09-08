-- CreateTable
CREATE TABLE "payment_provider_credentials" (
    "id" UUID NOT NULL,
    "payment_provider_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_provider_credentials_provider_key" ON "payment_provider_credentials"("payment_provider_id", "key");

-- AddForeignKey
ALTER TABLE "payment_provider_credentials" ADD CONSTRAINT "payment_provider_credentials_payment_provider_id_fkey" FOREIGN KEY ("payment_provider_id") REFERENCES "payment_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
