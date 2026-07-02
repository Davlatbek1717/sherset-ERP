-- CreateTable
CREATE TABLE "sms_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'eskiz',
    "email" VARCHAR(255) NOT NULL,
    "password_cipher" VARCHAR(500) NOT NULL,
    "sender_id" VARCHAR(20),
    "token" VARCHAR(2000),
    "token_issued_at" TIMESTAMPTZ,
    "last_tested_at" TIMESTAMPTZ,
    "last_test_ok" BOOLEAN,
    "last_test_msg" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sms_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "sender_id" UUID,
    "entity" VARCHAR(50),
    "entity_id" UUID,
    "to_phone" VARCHAR(20) NOT NULL,
    "body" VARCHAR(1600) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "max_attempts" INTEGER NOT NULL DEFAULT 4,
    "next_retry_at" TIMESTAMPTZ,
    "attempted_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "provider_message_id" VARCHAR(100),
    "error_msg" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edo_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "stir" VARCHAR(20) NOT NULL,
    "org_name_cyrl" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'didox',
    "api_base_url" VARCHAR(255) NOT NULL,
    "api_token_cipher" VARCHAR(2000),
    "pfx_cipher" BYTEA,
    "pfx_pass_cipher" VARCHAR(500),
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "last_tested_at" TIMESTAMPTZ,
    "last_test_ok" BOOLEAN,
    "last_test_msg" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "edo_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edo_submissions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "source_entity" VARCHAR(50) NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "provider_ehf_id" VARCHAR(100),
    "ehf_number" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "xml_body" TEXT,
    "signature_b64" TEXT,
    "signed_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "confirmed_at" TIMESTAMPTZ,
    "error_msg" TEXT,
    "buyer_stir" VARCHAR(20),
    "provider_log" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "edo_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_configs_account_id_key" ON "sms_configs"("account_id");

-- CreateIndex
CREATE INDEX "sms_logs_status_next_retry_at_idx" ON "sms_logs"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "sms_logs_account_id_created_at_idx" ON "sms_logs"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sms_logs_account_id_entity_entity_id_created_at_idx" ON "sms_logs"("account_id", "entity", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "edo_configs_account_id_key" ON "edo_configs"("account_id");

-- CreateIndex
CREATE INDEX "edo_submissions_account_id_status_created_at_idx" ON "edo_submissions"("account_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "edo_submissions_provider_ehf_id_idx" ON "edo_submissions"("provider_ehf_id");

-- CreateIndex
CREATE UNIQUE INDEX "edo_submissions_account_id_source_entity_source_entity_id_key" ON "edo_submissions"("account_id", "source_entity", "source_entity_id");

-- AddForeignKey
ALTER TABLE "sms_configs" ADD CONSTRAINT "sms_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edo_configs" ADD CONSTRAINT "edo_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edo_submissions" ADD CONSTRAINT "edo_submissions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
