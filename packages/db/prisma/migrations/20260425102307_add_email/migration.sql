-- CreateTable
CREATE TABLE "email_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'custom',
    "from_name" VARCHAR(255),
    "from_email" VARCHAR(255) NOT NULL,
    "reply_to" VARCHAR(255),
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(255) NOT NULL,
    "password_cipher" TEXT NOT NULL,
    "last_tested_at" TIMESTAMPTZ,
    "last_test_ok" BOOLEAN,
    "last_test_msg" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "sender_id" UUID,
    "entity" VARCHAR(50),
    "entity_id" UUID,
    "to_addresses" TEXT[],
    "cc_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" VARCHAR(500) NOT NULL,
    "body_html" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "error_msg" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_configs_account_id_key" ON "email_configs"("account_id");

-- CreateIndex
CREATE INDEX "email_logs_account_id_entity_entity_id_created_at_idx" ON "email_logs"("account_id", "entity", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "email_logs_account_id_created_at_idx" ON "email_logs"("account_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "email_configs" ADD CONSTRAINT "email_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
