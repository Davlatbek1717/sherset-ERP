-- CreateTable
CREATE TABLE "retail_stores" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "external_code" VARCHAR(50),
    "sync_id" UUID,
    "address" TEXT,
    "address_full" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "auth_token_attached" BOOLEAN NOT NULL DEFAULT false,
    "control_cashier_choice" BOOLEAN NOT NULL DEFAULT false,
    "control_shipping_stock" BOOLEAN NOT NULL DEFAULT true,
    "allow_create_products" BOOLEAN NOT NULL DEFAULT false,
    "allow_custom_price" BOOLEAN NOT NULL DEFAULT false,
    "allow_delete_receipt_positions" BOOLEAN NOT NULL DEFAULT true,
    "allow_sell_tobacco_without_mrc" BOOLEAN NOT NULL DEFAULT false,
    "discount_enable" BOOLEAN NOT NULL DEFAULT true,
    "discount_max_percent" INTEGER,
    "enable_returns_with_no_reason" BOOLEAN NOT NULL DEFAULT true,
    "return_from_closed_shift_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sell_reserves" BOOLEAN NOT NULL DEFAULT false,
    "reserve_prepaid_goods" BOOLEAN NOT NULL DEFAULT true,
    "only_in_stock" BOOLEAN NOT NULL DEFAULT false,
    "print_always" BOOLEAN NOT NULL DEFAULT true,
    "show_beer_on_tap" BOOLEAN NOT NULL DEFAULT false,
    "sync_agents" BOOLEAN NOT NULL DEFAULT true,
    "issue_orders" BOOLEAN NOT NULL DEFAULT true,
    "demand_prefix" VARCHAR(20),
    "required_fio" BOOLEAN NOT NULL DEFAULT false,
    "required_phone" BOOLEAN NOT NULL DEFAULT false,
    "required_email" BOOLEAN NOT NULL DEFAULT false,
    "required_birthdate" BOOLEAN NOT NULL DEFAULT false,
    "required_sex" BOOLEAN NOT NULL DEFAULT false,
    "required_discount_card_number" BOOLEAN NOT NULL DEFAULT false,
    "default_tax_system" VARCHAR(30),
    "order_tax_system" VARCHAR(30),
    "fiscal_type" VARCHAR(30),
    "ofd_enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority_ofd_send" VARCHAR(30),
    "send_marks_for_check" BOOLEAN NOT NULL DEFAULT false,
    "send_marks_to_chestny_znak_on_cloud" BOOLEAN NOT NULL DEFAULT false,
    "marking_selling_mode" VARCHAR(30),
    "marks_check_mode" VARCHAR(30),
    "tobacco_mrc_control_type" VARCHAR(30),
    "bank_percent" DECIMAL(5,2),
    "qr_pay_enabled" BOOLEAN NOT NULL DEFAULT false,
    "qr_bank_percent" DECIMAL(5,2),
    "qr_terminal_id" VARCHAR(50),
    "id_qr" VARCHAR(255),
    "minion_to_master_type" VARCHAR(20),
    "master_retail_stores" JSONB,
    "product_folders" JSONB,
    "create_agents_tags" JSONB,
    "filter_agents_tags" JSONB,
    "create_order_with_state_id" UUID,
    "order_to_state_id" UUID,
    "customer_order_states_json" JSONB,
    "cashiers_json" JSONB,
    "acquire_id" UUID,
    "qr_acquire_id" UUID,
    "receipt_template_id" UUID,
    "price_type_id" UUID,
    "environment_json" JSONB,
    "last_operation_names_json" JSONB,
    "state" VARCHAR(30),
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "retail_stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retail_stores_account_id_archived_idx" ON "retail_stores"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "retail_stores_account_id_name_key" ON "retail_stores"("account_id", "name");

-- AddForeignKey
ALTER TABLE "retail_stores" ADD CONSTRAINT "retail_stores_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_stores" ADD CONSTRAINT "retail_stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_stores" ADD CONSTRAINT "retail_stores_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_stores" ADD CONSTRAINT "retail_stores_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_stores" ADD CONSTRAINT "retail_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_stores" ADD CONSTRAINT "retail_stores_price_type_id_fkey" FOREIGN KEY ("price_type_id") REFERENCES "price_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
