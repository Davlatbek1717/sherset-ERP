-- CreateTable
CREATE TABLE "tracking_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "cis" VARCHAR(255) NOT NULL,
    "cis_1162" VARCHAR(255),
    "type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "product_id" UUID,
    "variant_id" UUID,
    "tracking_codes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tracking_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prepayments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "agent_id" UUID NOT NULL,
    "agent_account_id" UUID,
    "organization_id" UUID NOT NULL,
    "organization_account_id" UUID,
    "customer_order_id" UUID,
    "retail_shift_id" UUID,
    "retail_store_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "no_cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "qr_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "tax_system" VARCHAR(30),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "prepayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prepayment_returns" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "agent_id" UUID NOT NULL,
    "agent_account_id" UUID,
    "organization_id" UUID NOT NULL,
    "organization_account_id" UUID,
    "prepayment_id" UUID NOT NULL,
    "retail_shift_id" UUID,
    "retail_store_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "no_cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "qr_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "tax_system" VARCHAR(30),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "prepayment_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_planned_moment" TIMESTAMPTZ,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "moved_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "internal_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_adjustments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "direction" VARCHAR(10) NOT NULL DEFAULT 'INCREASE',
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "counterparty_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "organization_id" UUID NOT NULL,
    "price_type_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "prices_json" JSONB NOT NULL DEFAULT '{}',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_drawer_cash_in" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "retail_shift_id" UUID NOT NULL,
    "agent_id" UUID,
    "organization_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "retail_drawer_cash_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_drawer_cash_out" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "retail_shift_id" UUID NOT NULL,
    "agent_id" UUID,
    "organization_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "retail_drawer_cash_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_sales_returns" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "agent_id" UUID,
    "agent_account_id" UUID,
    "organization_id" UUID NOT NULL,
    "organization_account_id" UUID,
    "store_id" UUID,
    "retail_shift_id" UUID,
    "retail_store_id" UUID,
    "demand_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "no_cash_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "qr_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_included" BOOLEAN NOT NULL DEFAULT false,
    "tax_system" VARCHAR(30),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "retail_sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracking_codes_account_id_type_status_idx" ON "tracking_codes"("account_id", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_codes_account_id_cis_key" ON "tracking_codes"("account_id", "cis");

-- CreateIndex
CREATE INDEX "prepayments_account_id_state_deleted_at_idx" ON "prepayments"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "prepayments_account_id_agent_id_idx" ON "prepayments"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "prepayments_account_id_customer_order_id_idx" ON "prepayments"("account_id", "customer_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "prepayments_account_id_name_key" ON "prepayments"("account_id", "name");

-- CreateIndex
CREATE INDEX "prepayment_returns_account_id_prepayment_id_idx" ON "prepayment_returns"("account_id", "prepayment_id");

-- CreateIndex
CREATE UNIQUE INDEX "prepayment_returns_account_id_name_key" ON "prepayment_returns"("account_id", "name");

-- CreateIndex
CREATE INDEX "internal_orders_account_id_state_deleted_at_idx" ON "internal_orders"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "internal_orders_account_id_name_key" ON "internal_orders"("account_id", "name");

-- CreateIndex
CREATE INDEX "counterparty_adjustments_account_id_agent_id_idx" ON "counterparty_adjustments"("account_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_adjustments_account_id_name_key" ON "counterparty_adjustments"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_account_id_name_key" ON "price_lists"("account_id", "name");

-- CreateIndex
CREATE INDEX "retail_drawer_cash_in_account_id_retail_shift_id_idx" ON "retail_drawer_cash_in"("account_id", "retail_shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "retail_drawer_cash_in_account_id_name_key" ON "retail_drawer_cash_in"("account_id", "name");

-- CreateIndex
CREATE INDEX "retail_drawer_cash_out_account_id_retail_shift_id_idx" ON "retail_drawer_cash_out"("account_id", "retail_shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "retail_drawer_cash_out_account_id_name_key" ON "retail_drawer_cash_out"("account_id", "name");

-- CreateIndex
CREATE INDEX "retail_sales_returns_account_id_retail_shift_id_idx" ON "retail_sales_returns"("account_id", "retail_shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "retail_sales_returns_account_id_name_key" ON "retail_sales_returns"("account_id", "name");

-- AddForeignKey
ALTER TABLE "tracking_codes" ADD CONSTRAINT "tracking_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepayment_returns" ADD CONSTRAINT "prepayment_returns_prepayment_id_fkey" FOREIGN KEY ("prepayment_id") REFERENCES "prepayments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_orders" ADD CONSTRAINT "internal_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_orders" ADD CONSTRAINT "internal_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_orders" ADD CONSTRAINT "internal_orders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_orders" ADD CONSTRAINT "internal_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_orders" ADD CONSTRAINT "internal_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_adjustments" ADD CONSTRAINT "counterparty_adjustments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_adjustments" ADD CONSTRAINT "counterparty_adjustments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_adjustments" ADD CONSTRAINT "counterparty_adjustments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_adjustments" ADD CONSTRAINT "counterparty_adjustments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_adjustments" ADD CONSTRAINT "counterparty_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_price_type_id_fkey" FOREIGN KEY ("price_type_id") REFERENCES "price_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_in" ADD CONSTRAINT "retail_drawer_cash_in_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_in" ADD CONSTRAINT "retail_drawer_cash_in_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_in" ADD CONSTRAINT "retail_drawer_cash_in_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_in" ADD CONSTRAINT "retail_drawer_cash_in_retail_shift_id_fkey" FOREIGN KEY ("retail_shift_id") REFERENCES "cashier_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_in" ADD CONSTRAINT "retail_drawer_cash_in_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_in" ADD CONSTRAINT "retail_drawer_cash_in_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_out" ADD CONSTRAINT "retail_drawer_cash_out_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_out" ADD CONSTRAINT "retail_drawer_cash_out_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_out" ADD CONSTRAINT "retail_drawer_cash_out_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_out" ADD CONSTRAINT "retail_drawer_cash_out_retail_shift_id_fkey" FOREIGN KEY ("retail_shift_id") REFERENCES "cashier_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_out" ADD CONSTRAINT "retail_drawer_cash_out_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_drawer_cash_out" ADD CONSTRAINT "retail_drawer_cash_out_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_agent_account_id_fkey" FOREIGN KEY ("agent_account_id") REFERENCES "counterparty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_retail_shift_id_fkey" FOREIGN KEY ("retail_shift_id") REFERENCES "cashier_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales_returns" ADD CONSTRAINT "retail_sales_returns_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "retail_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
