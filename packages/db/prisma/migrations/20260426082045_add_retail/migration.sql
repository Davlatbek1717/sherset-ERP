-- CreateTable
CREATE TABLE "cashier_sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "cash_desk_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "opening_cash_minor" BIGINT NOT NULL DEFAULT 0,
    "closing_cash_minor" BIGINT,
    "expected_cash_minor" BIGINT,
    "discrepancy_minor" BIGINT,
    "state" VARCHAR(10) NOT NULL DEFAULT 'open',
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "sales_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "returns_count" INTEGER NOT NULL DEFAULT 0,
    "returns_sum_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cashier_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_sales" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "agent_id" UUID,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "cash_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "card_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "change_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_from_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "retail_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_sale_positions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "retail_sale_id" UUID NOT NULL,
    "product_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(20,6) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sum_minor" BIGINT NOT NULL,

    CONSTRAINT "retail_sale_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashier_sessions_account_id_cashier_id_state_idx" ON "cashier_sessions"("account_id", "cashier_id", "state");

-- CreateIndex
CREATE INDEX "cashier_sessions_account_id_cash_desk_id_state_idx" ON "cashier_sessions"("account_id", "cash_desk_id", "state");

-- CreateIndex
CREATE INDEX "retail_sales_account_id_session_id_state_idx" ON "retail_sales"("account_id", "session_id", "state");

-- CreateIndex
CREATE INDEX "retail_sales_account_id_state_moment_idx" ON "retail_sales"("account_id", "state", "moment" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "retail_sales_account_id_name_key" ON "retail_sales"("account_id", "name");

-- CreateIndex
CREATE INDEX "retail_sale_positions_retail_sale_id_position_idx" ON "retail_sale_positions"("retail_sale_id", "position");

-- CreateIndex
CREATE INDEX "retail_sale_positions_account_id_product_id_idx" ON "retail_sale_positions"("account_id", "product_id");

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cashier_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_refunded_from_id_fkey" FOREIGN KEY ("refunded_from_id") REFERENCES "retail_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_positions" ADD CONSTRAINT "retail_sale_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_positions" ADD CONSTRAINT "retail_sale_positions_retail_sale_id_fkey" FOREIGN KEY ("retail_sale_id") REFERENCES "retail_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_positions" ADD CONSTRAINT "retail_sale_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
