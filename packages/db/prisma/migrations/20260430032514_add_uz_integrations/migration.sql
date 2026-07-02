-- CreateTable
CREATE TABLE "marking_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "stir" VARCHAR(20) NOT NULL,
    "api_base_url" VARCHAR(255) NOT NULL,
    "api_token_cipher" VARCHAR(2000),
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "last_tested_at" TIMESTAMPTZ,
    "last_test_ok" BOOLEAN,
    "last_test_msg" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "marking_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marking_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "code" VARCHAR(200) NOT NULL,
    "gtin" VARCHAR(20) NOT NULL,
    "serial" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'allocated',
    "source_entity" VARCHAR(40),
    "source_entity_id" UUID,
    "provider_log" JSONB,
    "error_msg" TEXT,
    "allocated_at" TIMESTAMPTZ,
    "applied_at" TIMESTAMPTZ,
    "sold_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "marking_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "bot_token_cipher" VARCHAR(500) NOT NULL,
    "bot_username" VARCHAR(50),
    "webhook_url" VARCHAR(500),
    "webhook_secret" VARCHAR(255),
    "default_chat_id" VARCHAR(40),
    "last_tested_at" TIMESTAMPTZ,
    "last_test_ok" BOOLEAN,
    "last_test_msg" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "telegram_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_outbox" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "chat_id" VARCHAR(40) NOT NULL,
    "parse_mode" VARCHAR(20) NOT NULL DEFAULT 'HTML',
    "text" VARCHAR(4096) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "max_attempts" INTEGER NOT NULL DEFAULT 4,
    "next_retry_at" TIMESTAMPTZ,
    "attempted_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "provider_message_id" VARCHAR(40),
    "error_msg" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "merchant_id" VARCHAR(100) NOT NULL,
    "creds_cipher" VARCHAR(2000) NOT NULL,
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "callback_url" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_txs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_tx_id" VARCHAR(100),
    "source_entity" VARCHAR(40) NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "authorized_at" TIMESTAMPTZ,
    "captured_at" TIMESTAMPTZ,
    "refunded_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "provider_log" JSONB,
    "error_msg" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_gateway_txs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_api_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "bank_code" VARCHAR(20) NOT NULL,
    "stir" VARCHAR(20) NOT NULL,
    "bank_account" VARCHAR(50) NOT NULL,
    "bank_mfo" VARCHAR(10) NOT NULL,
    "api_base_url" VARCHAR(255) NOT NULL,
    "creds_cipher" VARCHAR(4000) NOT NULL,
    "last_pull_at" TIMESTAMPTZ,
    "last_pull_ok" BOOLEAN,
    "last_pull_msg" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bank_api_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_c_sync_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "endpoint_url" VARCHAR(500) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_cipher" VARCHAR(500) NOT NULL,
    "direction" VARCHAR(20) NOT NULL DEFAULT 'bidirectional',
    "poll_interval_min" INTEGER NOT NULL DEFAULT 60,
    "last_sync_at" TIMESTAMPTZ,
    "last_sync_ok" BOOLEAN,
    "last_sync_msg" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "one_c_sync_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_c_sync_logs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "error_msg" TEXT,

    CONSTRAINT "one_c_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "marketplace" VARCHAR(20) NOT NULL,
    "shop_name" VARCHAR(255) NOT NULL,
    "seller_id" VARCHAR(100) NOT NULL,
    "api_base_url" VARCHAR(255) NOT NULL,
    "creds_cipher" VARCHAR(2000) NOT NULL,
    "last_catalog_push_at" TIMESTAMPTZ,
    "last_order_pull_at" TIMESTAMPTZ,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "marketplace_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "marketplace" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "raw_json" JSONB NOT NULL,
    "internal_order_id" UUID,
    "pulled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marking_configs_account_id_key" ON "marking_configs"("account_id");

-- CreateIndex
CREATE INDEX "marking_codes_account_id_product_id_status_idx" ON "marking_codes"("account_id", "product_id", "status");

-- CreateIndex
CREATE INDEX "marking_codes_account_id_status_created_at_idx" ON "marking_codes"("account_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "marking_codes_gtin_serial_idx" ON "marking_codes"("gtin", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "marking_codes_account_id_code_key" ON "marking_codes"("account_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_configs_account_id_key" ON "telegram_configs"("account_id");

-- CreateIndex
CREATE INDEX "telegram_outbox_status_next_retry_at_idx" ON "telegram_outbox"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "telegram_outbox_account_id_created_at_idx" ON "telegram_outbox"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payment_gateway_configs_account_id_enabled_idx" ON "payment_gateway_configs"("account_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_configs_account_id_provider_key" ON "payment_gateway_configs"("account_id", "provider");

-- CreateIndex
CREATE INDEX "payment_gateway_txs_account_id_provider_status_idx" ON "payment_gateway_txs"("account_id", "provider", "status");

-- CreateIndex
CREATE INDEX "payment_gateway_txs_account_id_source_entity_source_entity__idx" ON "payment_gateway_txs"("account_id", "source_entity", "source_entity_id");

-- CreateIndex
CREATE INDEX "payment_gateway_txs_provider_tx_id_idx" ON "payment_gateway_txs"("provider_tx_id");

-- CreateIndex
CREATE INDEX "bank_api_configs_account_id_enabled_idx" ON "bank_api_configs"("account_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "bank_api_configs_account_id_bank_code_bank_account_key" ON "bank_api_configs"("account_id", "bank_code", "bank_account");

-- CreateIndex
CREATE UNIQUE INDEX "one_c_sync_configs_account_id_key" ON "one_c_sync_configs"("account_id");

-- CreateIndex
CREATE INDEX "one_c_sync_logs_account_id_started_at_idx" ON "one_c_sync_logs"("account_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_configs_account_id_marketplace_key" ON "marketplace_configs"("account_id", "marketplace");

-- CreateIndex
CREATE INDEX "marketplace_orders_account_id_marketplace_status_idx" ON "marketplace_orders"("account_id", "marketplace", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_account_id_marketplace_external_id_key" ON "marketplace_orders"("account_id", "marketplace", "external_id");

-- AddForeignKey
ALTER TABLE "marking_configs" ADD CONSTRAINT "marking_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_codes" ADD CONSTRAINT "marking_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_configs" ADD CONSTRAINT "telegram_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_outbox" ADD CONSTRAINT "telegram_outbox_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_txs" ADD CONSTRAINT "payment_gateway_txs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_api_configs" ADD CONSTRAINT "bank_api_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_c_sync_configs" ADD CONSTRAINT "one_c_sync_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_c_sync_logs" ADD CONSTRAINT "one_c_sync_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_configs" ADD CONSTRAINT "marketplace_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
