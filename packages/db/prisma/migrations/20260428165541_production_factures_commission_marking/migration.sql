-- CreateTable
CREATE TABLE "processing_processes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "processing_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_stages" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "process_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "default" BOOLEAN NOT NULL DEFAULT true,
    "labor_cost_minor" BIGINT NOT NULL DEFAULT 0,
    "material_markup" INTEGER NOT NULL DEFAULT 0,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "processing_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_plan_folders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "path_name" VARCHAR(500),
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "processing_plan_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productions" (
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
    "customer_order_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_planned_moment" TIMESTAMPTZ,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
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

    CONSTRAINT "productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_orders" (
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
    "production_id" UUID,
    "processing_plan_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "quantity" BIGINT NOT NULL DEFAULT 0,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "processing_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "organization_id" UUID NOT NULL,
    "materials_store_id" UUID NOT NULL,
    "products_store_id" UUID NOT NULL,
    "processing_order_id" UUID,
    "processing_plan_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "quantity" BIGINT NOT NULL DEFAULT 0,
    "cost_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "processings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures_out" (
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
    "demand_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
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

    CONSTRAINT "factures_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures_in" (
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
    "supply_id" UUID,
    "incoming_number" VARCHAR(100),
    "incoming_date" TIMESTAMPTZ,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
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

    CONSTRAINT "factures_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_reports_out" (
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
    "contract_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reward_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reward_vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
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

    CONSTRAINT "commission_reports_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_reports_in" (
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
    "contract_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reward_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reward_vat_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "payed_sum_minor" BIGINT NOT NULL DEFAULT 0,
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

    CONSTRAINT "commission_reports_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emission_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "organization_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "product_group" VARCHAR(30),
    "codes_requested" INTEGER NOT NULL DEFAULT 0,
    "codes_issued" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "emission_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marking_code_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "organization_id" UUID NOT NULL,
    "emission_order_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "codes_json" JSONB,
    "codes_count" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "marking_code_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retire_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "external_code" VARCHAR(50),
    "organization_id" UUID NOT NULL,
    "parent_entity" VARCHAR(40),
    "parent_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "retire_type" VARCHAR(30),
    "codes_json" JSONB,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "retire_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processing_processes_account_id_name_key" ON "processing_processes"("account_id", "name");

-- CreateIndex
CREATE INDEX "processing_stages_account_id_process_id_position_idx" ON "processing_stages"("account_id", "process_id", "position");

-- CreateIndex
CREATE INDEX "processing_plan_folders_account_id_parent_id_idx" ON "processing_plan_folders"("account_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "processing_plan_folders_account_id_code_key" ON "processing_plan_folders"("account_id", "code");

-- CreateIndex
CREATE INDEX "productions_account_id_state_deleted_at_idx" ON "productions"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "productions_account_id_name_key" ON "productions"("account_id", "name");

-- CreateIndex
CREATE INDEX "processing_orders_account_id_state_deleted_at_idx" ON "processing_orders"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "processing_orders_account_id_name_key" ON "processing_orders"("account_id", "name");

-- CreateIndex
CREATE INDEX "processings_account_id_state_deleted_at_idx" ON "processings"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "processings_account_id_name_key" ON "processings"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "factures_out_account_id_name_key" ON "factures_out"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "factures_in_account_id_name_key" ON "factures_in"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "commission_reports_out_account_id_name_key" ON "commission_reports_out"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "commission_reports_in_account_id_name_key" ON "commission_reports_in"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "emission_orders_account_id_name_key" ON "emission_orders"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "marking_code_orders_account_id_name_key" ON "marking_code_orders"("account_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "retire_orders_account_id_name_key" ON "retire_orders"("account_id", "name");

-- AddForeignKey
ALTER TABLE "processing_processes" ADD CONSTRAINT "processing_processes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_processes" ADD CONSTRAINT "processing_processes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_processes" ADD CONSTRAINT "processing_processes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_stages" ADD CONSTRAINT "processing_stages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_stages" ADD CONSTRAINT "processing_stages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_stages" ADD CONSTRAINT "processing_stages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_stages" ADD CONSTRAINT "processing_stages_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processing_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_plan_folders" ADD CONSTRAINT "processing_plan_folders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_plan_folders" ADD CONSTRAINT "processing_plan_folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_plan_folders" ADD CONSTRAINT "processing_plan_folders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_plan_folders" ADD CONSTRAINT "processing_plan_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "processing_plan_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_customer_order_id_fkey" FOREIGN KEY ("customer_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_processing_plan_id_fkey" FOREIGN KEY ("processing_plan_id") REFERENCES "bills_of_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_materials_store_id_fkey" FOREIGN KEY ("materials_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_products_store_id_fkey" FOREIGN KEY ("products_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_processing_order_id_fkey" FOREIGN KEY ("processing_order_id") REFERENCES "processing_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processings" ADD CONSTRAINT "processings_processing_plan_id_fkey" FOREIGN KEY ("processing_plan_id") REFERENCES "bills_of_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_out" ADD CONSTRAINT "factures_out_demand_id_fkey" FOREIGN KEY ("demand_id") REFERENCES "demands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_in" ADD CONSTRAINT "factures_in_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_in" ADD CONSTRAINT "factures_in_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_in" ADD CONSTRAINT "factures_in_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_in" ADD CONSTRAINT "factures_in_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_in" ADD CONSTRAINT "factures_in_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_in" ADD CONSTRAINT "factures_in_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_out" ADD CONSTRAINT "commission_reports_out_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_out" ADD CONSTRAINT "commission_reports_out_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_out" ADD CONSTRAINT "commission_reports_out_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_out" ADD CONSTRAINT "commission_reports_out_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_out" ADD CONSTRAINT "commission_reports_out_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_out" ADD CONSTRAINT "commission_reports_out_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_in" ADD CONSTRAINT "commission_reports_in_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_in" ADD CONSTRAINT "commission_reports_in_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_in" ADD CONSTRAINT "commission_reports_in_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_in" ADD CONSTRAINT "commission_reports_in_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_in" ADD CONSTRAINT "commission_reports_in_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_reports_in" ADD CONSTRAINT "commission_reports_in_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emission_orders" ADD CONSTRAINT "emission_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emission_orders" ADD CONSTRAINT "emission_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emission_orders" ADD CONSTRAINT "emission_orders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emission_orders" ADD CONSTRAINT "emission_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_code_orders" ADD CONSTRAINT "marking_code_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_code_orders" ADD CONSTRAINT "marking_code_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_code_orders" ADD CONSTRAINT "marking_code_orders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_code_orders" ADD CONSTRAINT "marking_code_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_code_orders" ADD CONSTRAINT "marking_code_orders_emission_order_id_fkey" FOREIGN KEY ("emission_order_id") REFERENCES "emission_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retire_orders" ADD CONSTRAINT "retire_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retire_orders" ADD CONSTRAINT "retire_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retire_orders" ADD CONSTRAINT "retire_orders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retire_orders" ADD CONSTRAINT "retire_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
