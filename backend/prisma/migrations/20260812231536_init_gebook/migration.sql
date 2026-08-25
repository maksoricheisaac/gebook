-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'inactive', 'blocked');

-- CreateEnum
CREATE TYPE "author_status" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "category_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "work_status" AS ENUM ('draft', 'published', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "format_type" AS ENUM ('pdf', 'paper', 'epub', 'audio');

-- CreateEnum
CREATE TYPE "delivery_type" AS ENUM ('digital_download', 'physical_delivery', 'pickup');

-- CreateEnum
CREATE TYPE "file_type" AS ENUM ('full', 'sample', 'cover', 'supplement');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed');

-- CreateEnum
CREATE TYPE "provider_environment" AS ENUM ('sandbox', 'production');

-- CreateEnum
CREATE TYPE "provider_status" AS ENUM ('active', 'inactive', 'maintenance');

-- CreateEnum
CREATE TYPE "synchronization_status" AS ENUM ('not_synced', 'pending', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('initialized', 'pending', 'successful', 'failed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "event_processing_status" AS ENUM ('received', 'processed', 'ignored', 'failed');

-- CreateEnum
CREATE TYPE "access_status" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "commission_type" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "calculation_base" AS ENUM ('gross_amount', 'after_provider_fee');

-- CreateEnum
CREATE TYPE "commission_rule_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('pending', 'available', 'partially_paid', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "setting_value_type" AS ENUM ('string', 'integer', 'decimal', 'boolean', 'json');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "email" VARCHAR(190) NOT NULL,
    "phone" VARCHAR(30),
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "pen_name" VARCHAR(150) NOT NULL,
    "legal_name" VARCHAR(150),
    "slug" VARCHAR(180) NOT NULL,
    "biography" TEXT,
    "short_biography" VARCHAR(500),
    "photo_path" VARCHAR(255),
    "birth_date" DATE,
    "country" VARCHAR(100),
    "city" VARCHAR(100),
    "public_email" VARCHAR(190),
    "public_phone" VARCHAR(30),
    "payout_phone" VARCHAR(30),
    "payout_method" VARCHAR(100),
    "status" "author_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "status" "category_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "category_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "subtitle" VARCHAR(255),
    "slug" VARCHAR(280) NOT NULL,
    "short_description" VARCHAR(500),
    "description" TEXT,
    "table_of_contents" TEXT,
    "cover_path" VARCHAR(255),
    "isbn" VARCHAR(50),
    "language" VARCHAR(50) NOT NULL DEFAULT 'Français',
    "page_count" INTEGER,
    "publication_year" INTEGER,
    "publication_date" DATE,
    "edition" VARCHAR(100),
    "status" "work_status" NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_formats" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "format_type" "format_type" NOT NULL,
    "label" VARCHAR(100),
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "stock_quantity" INTEGER,
    "unlimited_stock" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "delivery_type" "delivery_type" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_files" (
    "id" UUID NOT NULL,
    "work_format_id" UUID NOT NULL,
    "file_type" "file_type" NOT NULL,
    "original_name" VARCHAR(255),
    "stored_name" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100),
    "file_size" INTEGER,
    "checksum" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "recipient_name" VARCHAR(150),
    "delivery_phone" VARCHAR(30),
    "delivery_country" VARCHAR(100),
    "delivery_city" VARCHAR(100),
    "delivery_district" VARCHAR(100),
    "delivery_address" TEXT,
    "delivery_landmark" VARCHAR(255),
    "paid_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "work_format_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "work_title" VARCHAR(255) NOT NULL,
    "author_name" VARCHAR(150) NOT NULL,
    "format_type" VARCHAR(30) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "line_total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_providers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "driver" VARCHAR(150) NOT NULL,
    "environment" "provider_environment" NOT NULL DEFAULT 'sandbox',
    "status" "provider_status" NOT NULL DEFAULT 'inactive',
    "supports_mobile_money" BOOLEAN NOT NULL DEFAULT false,
    "supports_card" BOOLEAN NOT NULL DEFAULT false,
    "supports_refund" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_products" (
    "id" UUID NOT NULL,
    "payment_provider_id" UUID NOT NULL,
    "work_format_id" UUID NOT NULL,
    "external_product_id" VARCHAR(190),
    "external_price_id" VARCHAR(190),
    "external_checkout_url" TEXT,
    "synchronization_status" "synchronization_status" NOT NULL DEFAULT 'not_synced',
    "last_synced_at" TIMESTAMPTZ(6),
    "raw_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_provider_id" UUID NOT NULL,
    "provider_transaction_id" VARCHAR(190),
    "provider_reference" VARCHAR(190),
    "idempotency_key" VARCHAR(190),
    "checkout_url" TEXT,
    "expected_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2),
    "provider_fee" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "payment_method" VARCHAR(100),
    "status" "payment_status" NOT NULL DEFAULT 'initialized',
    "raw_response" JSONB,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "payment_provider_id" UUID NOT NULL,
    "event_id" VARCHAR(190),
    "event_type" VARCHAR(100),
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL DEFAULT false,
    "processing_status" "event_processing_status" NOT NULL DEFAULT 'received',
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reader_library" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "work_format_id" UUID NOT NULL,
    "access_status" "access_status" NOT NULL DEFAULT 'active',
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "reader_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downloads" (
    "id" UUID NOT NULL,
    "library_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_file_id" UUID NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "download_token_hash" VARCHAR(255),
    "downloaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "author_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "commission_type" "commission_type" NOT NULL DEFAULT 'percentage',
    "commission_value" DECIMAL(12,4) NOT NULL,
    "calculation_base" "calculation_base" NOT NULL DEFAULT 'after_provider_fee',
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "status" "commission_rule_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_distributions" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "commission_rule_id" UUID,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "provider_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_after_provider_fee" DECIMAL(12,2) NOT NULL,
    "gebook_commission_rate" DECIMAL(8,4),
    "gebook_commission_amount" DECIMAL(12,2) NOT NULL,
    "author_net_amount" DECIMAL(12,2) NOT NULL,
    "payout_status" "payout_status" NOT NULL DEFAULT 'pending',
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "setting_key" VARCHAR(150) NOT NULL,
    "setting_value" TEXT,
    "value_type" "setting_value_type" NOT NULL DEFAULT 'string',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(150) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" UUID,
    "description" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_status" ON "users"("status");

-- CreateIndex
CREATE INDEX "idx_users_phone" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "uq_roles_name" ON "roles"("name");

-- CreateIndex
CREATE INDEX "idx_user_roles_role" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_roles" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_authors_user" ON "authors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_authors_slug" ON "authors"("slug");

-- CreateIndex
CREATE INDEX "idx_authors_status" ON "authors"("status");

-- CreateIndex
CREATE INDEX "idx_authors_pen_name" ON "authors"("pen_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_categories_slug" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "idx_categories_status" ON "categories"("status");

-- CreateIndex
CREATE INDEX "idx_categories_parent" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_works_slug" ON "works"("slug");

-- CreateIndex
CREATE INDEX "idx_works_author" ON "works"("author_id");

-- CreateIndex
CREATE INDEX "idx_works_category" ON "works"("category_id");

-- CreateIndex
CREATE INDEX "idx_works_status" ON "works"("status");

-- CreateIndex
CREATE INDEX "idx_works_featured" ON "works"("featured");

-- CreateIndex
CREATE INDEX "idx_works_title" ON "works"("title");

-- CreateIndex
CREATE INDEX "idx_work_formats_available" ON "work_formats"("is_available");

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_format" ON "work_formats"("work_id", "format_type");

-- CreateIndex
CREATE INDEX "idx_work_files_format" ON "work_files"("work_format_id");

-- CreateIndex
CREATE INDEX "idx_work_files_type_active" ON "work_files"("file_type", "is_active");

-- CreateIndex
CREATE INDEX "idx_work_files_checksum" ON "work_files"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "uq_orders_number" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "idx_orders_user" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "idx_orders_status" ON "orders"("status");

-- CreateIndex
CREATE INDEX "idx_orders_created_at" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "idx_order_items_order" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "idx_order_items_work" ON "order_items"("work_id");

-- CreateIndex
CREATE INDEX "idx_order_items_format" ON "order_items"("work_format_id");

-- CreateIndex
CREATE INDEX "idx_order_items_author" ON "order_items"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_providers_code" ON "payment_providers"("code");

-- CreateIndex
CREATE INDEX "idx_payment_providers_status_priority" ON "payment_providers"("status", "priority");

-- CreateIndex
CREATE INDEX "idx_provider_products_format" ON "provider_products"("work_format_id");

-- CreateIndex
CREATE INDEX "idx_provider_products_sync_status" ON "provider_products"("synchronization_status");

-- CreateIndex
CREATE INDEX "idx_provider_products_external_product" ON "provider_products"("external_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_provider_product" ON "provider_products"("payment_provider_id", "work_format_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payments_provider_tx" ON "payments"("provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payments_idempotency_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_payments_order" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "idx_payments_provider" ON "payments"("payment_provider_id");

-- CreateIndex
CREATE INDEX "idx_payments_status" ON "payments"("status");

-- CreateIndex
CREATE INDEX "idx_payments_provider_reference" ON "payments"("provider_reference");

-- CreateIndex
CREATE INDEX "idx_payment_events_payment" ON "payment_events"("payment_id");

-- CreateIndex
CREATE INDEX "idx_payment_events_provider" ON "payment_events"("payment_provider_id");

-- CreateIndex
CREATE INDEX "idx_payment_events_status" ON "payment_events"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_events_provider_event" ON "payment_events"("payment_provider_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_library_order_item" ON "reader_library"("order_item_id");

-- CreateIndex
CREATE INDEX "idx_library_user_status" ON "reader_library"("user_id", "access_status");

-- CreateIndex
CREATE INDEX "idx_library_work" ON "reader_library"("work_id");

-- CreateIndex
CREATE INDEX "idx_library_format" ON "reader_library"("work_format_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_library_user_order_item" ON "reader_library"("user_id", "order_item_id");

-- CreateIndex
CREATE INDEX "idx_downloads_library" ON "downloads"("library_id");

-- CreateIndex
CREATE INDEX "idx_downloads_user" ON "downloads"("user_id");

-- CreateIndex
CREATE INDEX "idx_downloads_file" ON "downloads"("work_file_id");

-- CreateIndex
CREATE INDEX "idx_downloads_date" ON "downloads"("downloaded_at");

-- CreateIndex
CREATE INDEX "idx_commission_rules_author" ON "commission_rules"("author_id");

-- CreateIndex
CREATE INDEX "idx_commission_rules_status_dates" ON "commission_rules"("status", "effective_from", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sale_distribution_order_item" ON "sale_distributions"("order_item_id");

-- CreateIndex
CREATE INDEX "idx_sale_distributions_author" ON "sale_distributions"("author_id");

-- CreateIndex
CREATE INDEX "idx_sale_distributions_payout_status" ON "sale_distributions"("payout_status");

-- CreateIndex
CREATE INDEX "idx_sale_distributions_rule" ON "sale_distributions"("commission_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_settings_key" ON "settings"("setting_key");

-- CreateIndex
CREATE INDEX "idx_activity_logs_user" ON "activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_activity_logs_entity" ON "activity_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_activity_logs_created_at" ON "activity_logs"("created_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authors" ADD CONSTRAINT "fk_authors_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "fk_works_author" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "fk_works_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_formats" ADD CONSTRAINT "fk_work_formats_work" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_files" ADD CONSTRAINT "fk_work_files_format" FOREIGN KEY ("work_format_id") REFERENCES "work_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_work" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_format" FOREIGN KEY ("work_format_id") REFERENCES "work_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_author" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_products" ADD CONSTRAINT "fk_provider_products_provider" FOREIGN KEY ("payment_provider_id") REFERENCES "payment_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_products" ADD CONSTRAINT "fk_provider_products_format" FOREIGN KEY ("work_format_id") REFERENCES "work_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_provider" FOREIGN KEY ("payment_provider_id") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "fk_payment_events_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "fk_payment_events_provider" FOREIGN KEY ("payment_provider_id") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_library" ADD CONSTRAINT "fk_library_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_library" ADD CONSTRAINT "fk_library_order_item" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_library" ADD CONSTRAINT "fk_library_work" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_library" ADD CONSTRAINT "fk_library_format" FOREIGN KEY ("work_format_id") REFERENCES "work_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "fk_downloads_library" FOREIGN KEY ("library_id") REFERENCES "reader_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "fk_downloads_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "fk_downloads_file" FOREIGN KEY ("work_file_id") REFERENCES "work_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "fk_commission_rules_author" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_distributions" ADD CONSTRAINT "fk_distributions_order_item" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_distributions" ADD CONSTRAINT "fk_distributions_author" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_distributions" ADD CONSTRAINT "fk_distributions_rule" FOREIGN KEY ("commission_rule_id") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "fk_activity_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
