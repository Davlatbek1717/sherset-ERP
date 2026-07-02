-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "agent_id" UUID NOT NULL,
    "agent_account_id" UUID,
    "own_agent_id" UUID NOT NULL,
    "organization_account_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "description" TEXT,
    "contract_type" VARCHAR(20) NOT NULL DEFAULT 'Sales',
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reward_percent" INTEGER,
    "reward_type" VARCHAR(30),
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "account_country" VARCHAR(2) NOT NULL DEFAULT 'UZ',
    "default_currency_id" UUID,
    "global_operation_numbering" BOOLEAN NOT NULL DEFAULT false,
    "check_min_price" BOOLEAN NOT NULL DEFAULT false,
    "check_shipping_stock" BOOLEAN NOT NULL DEFAULT true,
    "use_recycle_bin" BOOLEAN NOT NULL DEFAULT true,
    "use_company_address" BOOLEAN NOT NULL DEFAULT true,
    "company_address" VARCHAR(255),
    "discount_strategy" VARCHAR(30) NOT NULL DEFAULT 'BY_PRIORITY',
    "price_types_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'uz-Latn',
    "print_format" VARCHAR(20) NOT NULL DEFAULT 'A4',
    "default_screen" VARCHAR(40),
    "default_company_id" UUID,
    "default_store_id" UUID,
    "default_project_id" UUID,
    "default_customer_id" UUID,
    "default_supplier_id" UUID,
    "fields_per_row" INTEGER NOT NULL DEFAULT 2,
    "auto_show_reports" BOOLEAN NOT NULL DEFAULT true,
    "mail_footer" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "secret_hash" VARCHAR(255),
    "url" VARCHAR(500) NOT NULL,
    "diff_type" VARCHAR(20),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "auth_context" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_stocks" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "stock_type" VARCHAR(20) NOT NULL,
    "report_type" VARCHAR(30) NOT NULL,
    "report_url" VARCHAR(500) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "webhook_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consignments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "label" VARCHAR(255) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "description" TEXT,
    "expiry_date" DATE,
    "barcodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB DEFAULT '{}',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "consignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_operations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "agent_id" UUID NOT NULL,
    "organization_id" UUID,
    "bonus_program_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "description" TEXT,
    "transaction_type" VARCHAR(20) NOT NULL,
    "category_type" VARCHAR(20),
    "transaction_status" VARCHAR(20) NOT NULL DEFAULT 'COMMITTED',
    "bonusValue" INTEGER NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "execution_date" TIMESTAMPTZ,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "parent_entity" VARCHAR(40),
    "parent_id" UUID,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bonus_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_account_id_archived_idx" ON "projects"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "projects_account_id_code_key" ON "projects"("account_id", "code");

-- CreateIndex
CREATE INDEX "contracts_account_id_agent_id_idx" ON "contracts"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "contracts_account_id_archived_idx" ON "contracts"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_account_id_name_key" ON "contracts"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_account_id_key" ON "company_settings"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_employee_id_key" ON "user_settings"("employee_id");

-- CreateIndex
CREATE INDEX "webhooks_account_id_entity_type_action_enabled_idx" ON "webhooks"("account_id", "entity_type", "action", "enabled");

-- CreateIndex
CREATE INDEX "webhook_stocks_account_id_enabled_idx" ON "webhook_stocks"("account_id", "enabled");

-- CreateIndex
CREATE INDEX "consignments_account_id_product_id_idx" ON "consignments"("account_id", "product_id");

-- CreateIndex
CREATE INDEX "consignments_account_id_variant_id_idx" ON "consignments"("account_id", "variant_id");

-- CreateIndex
CREATE INDEX "consignments_account_id_expiry_date_idx" ON "consignments"("account_id", "expiry_date");

-- CreateIndex
CREATE INDEX "bonus_operations_account_id_agent_id_moment_idx" ON "bonus_operations"("account_id", "agent_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "bonus_operations_account_id_transaction_status_idx" ON "bonus_operations"("account_id", "transaction_status");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_operations_account_id_name_key" ON "bonus_operations"("account_id", "name");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_own_agent_id_fkey" FOREIGN KEY ("own_agent_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_default_currency_id_fkey" FOREIGN KEY ("default_currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_stocks" ADD CONSTRAINT "webhook_stocks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_bonus_program_id_fkey" FOREIGN KEY ("bonus_program_id") REFERENCES "bonus_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
