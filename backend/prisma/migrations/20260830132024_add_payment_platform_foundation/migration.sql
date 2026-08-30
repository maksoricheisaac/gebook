-- CreateEnum
CREATE TYPE "payout_request_status" AS ENUM ('pending', 'approved', 'processing', 'paid', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "commission_rules" ADD COLUMN     "tenant_id" UUID,
ADD COLUMN     "tenant_type" "tenant_type";

-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "supports_payout" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sale_distributions" ADD COLUMN     "payout_id" UUID;

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "method" VARCHAR(100) NOT NULL,
    "beneficiary_name" VARCHAR(150) NOT NULL,
    "beneficiary_country" VARCHAR(100) NOT NULL,
    "beneficiary_account" VARCHAR(190) NOT NULL,
    "payout_provider_id" UUID,
    "provider_reference" VARCHAR(190),
    "status" "payout_request_status" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_events" (
    "id" UUID NOT NULL,
    "payout_id" UUID,
    "payout_provider_id" UUID NOT NULL,
    "event_id" VARCHAR(190),
    "event_type" VARCHAR(100),
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL DEFAULT false,
    "processing_status" "event_processing_status" NOT NULL DEFAULT 'received',
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payout_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_terms" (
    "id" UUID NOT NULL,
    "tenant_type" "tenant_type" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_terms_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "terms_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),

    CONSTRAINT "tenant_terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_payouts_tenant_status" ON "payouts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_payouts_status" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "idx_payouts_provider" ON "payouts"("payout_provider_id");

-- CreateIndex
CREATE INDEX "idx_payout_events_payout" ON "payout_events"("payout_id");

-- CreateIndex
CREATE INDEX "idx_payout_events_provider" ON "payout_events"("payout_provider_id");

-- CreateIndex
CREATE INDEX "idx_payout_events_status" ON "payout_events"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payout_events_provider_event" ON "payout_events"("payout_provider_id", "event_id");

-- CreateIndex
CREATE INDEX "idx_distribution_terms_type_active" ON "distribution_terms"("tenant_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_distribution_terms_type_version" ON "distribution_terms"("tenant_type", "version");

-- CreateIndex
CREATE INDEX "idx_terms_acceptance_tenant" ON "tenant_terms_acceptances"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_terms_acceptance_terms" ON "tenant_terms_acceptances"("terms_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_terms_acceptance_tenant_terms" ON "tenant_terms_acceptances"("tenant_id", "terms_id");

-- CreateIndex
CREATE INDEX "idx_commission_rules_tenant" ON "commission_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_commission_rules_tenant_type" ON "commission_rules"("tenant_type");

-- CreateIndex
CREATE INDEX "idx_sale_distributions_payout" ON "sale_distributions"("payout_id");

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "fk_commission_rules_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_distributions" ADD CONSTRAINT "fk_distributions_payout" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "fk_payouts_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "fk_payouts_requester" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "fk_payouts_approver" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "fk_payouts_provider" FOREIGN KEY ("payout_provider_id") REFERENCES "payment_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_events" ADD CONSTRAINT "fk_payout_events_payout" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_events" ADD CONSTRAINT "fk_payout_events_provider" FOREIGN KEY ("payout_provider_id") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_terms_acceptances" ADD CONSTRAINT "fk_terms_acceptance_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_terms_acceptances" ADD CONSTRAINT "fk_terms_acceptance_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_terms_acceptances" ADD CONSTRAINT "fk_terms_acceptance_terms" FOREIGN KEY ("terms_id") REFERENCES "distribution_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
