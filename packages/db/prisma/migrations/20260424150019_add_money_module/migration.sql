-- CreateTable
CREATE TABLE "organization_accounts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "bank_name" VARCHAR(255),
    "account_number" VARCHAR(50),
    "bic" VARCHAR(20),
    "balance_minor" BIGINT NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organization_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_desks" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "balance_minor" BIGINT NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cash_desks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_operations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organization_account_id" UUID,
    "cash_desk_id" UUID,
    "delta_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "document_kind" VARCHAR(30) NOT NULL,
    "document_id" UUID NOT NULL,
    "counterparty_id" UUID,
    "description" TEXT,

    CONSTRAINT "money_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_accounts_account_id_organization_id_idx" ON "organization_accounts"("account_id", "organization_id");

-- CreateIndex
CREATE INDEX "organization_accounts_account_id_archived_idx" ON "organization_accounts"("account_id", "archived");

-- CreateIndex
CREATE INDEX "cash_desks_account_id_archived_idx" ON "cash_desks"("account_id", "archived");

-- CreateIndex
CREATE INDEX "money_operations_account_id_organization_account_id_at_idx" ON "money_operations"("account_id", "organization_account_id", "at" DESC);

-- CreateIndex
CREATE INDEX "money_operations_account_id_cash_desk_id_at_idx" ON "money_operations"("account_id", "cash_desk_id", "at" DESC);

-- CreateIndex
CREATE INDEX "money_operations_account_id_document_kind_document_id_idx" ON "money_operations"("account_id", "document_kind", "document_id");

-- CreateIndex
CREATE INDEX "money_operations_account_id_counterparty_id_at_idx" ON "money_operations"("account_id", "counterparty_id", "at" DESC);

-- AddForeignKey
ALTER TABLE "organization_accounts" ADD CONSTRAINT "organization_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_accounts" ADD CONSTRAINT "organization_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desks" ADD CONSTRAINT "cash_desks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
