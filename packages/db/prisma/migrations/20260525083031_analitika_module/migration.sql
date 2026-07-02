-- CreateTable
CREATE TABLE "analitika_counts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "expected_qty" DECIMAL(20,6) NOT NULL,
    "kam_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "kop_qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "net_qty" DECIMAL(20,6) NOT NULL,
    "sale_price_minor" BIGINT NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "decision" VARCHAR(12),
    "counter_id" UUID NOT NULL,
    "counted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "reason_code_id" UUID,
    "note" TEXT,

    CONSTRAINT "analitika_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analitika_reason_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "analitika_reason_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analitika_variance_configs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "green_max_pct" DECIMAL(6,2) NOT NULL DEFAULT 5,
    "yellow_max_pct" DECIMAL(6,2) NOT NULL DEFAULT 15,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "analitika_variance_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analitika_orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "counterparty_id" UUID,
    "state" VARCHAR(20) NOT NULL DEFAULT 'formed',
    "total_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analitika_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analitika_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "sum_minor" BIGINT NOT NULL,

    CONSTRAINT "analitika_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analitika_counts_account_id_status_counted_at_idx" ON "analitika_counts"("account_id", "status", "counted_at" DESC);

-- CreateIndex
CREATE INDEX "analitika_counts_account_id_counter_id_idx" ON "analitika_counts"("account_id", "counter_id");

-- CreateIndex
CREATE UNIQUE INDEX "analitika_counts_account_id_product_id_store_id_key" ON "analitika_counts"("account_id", "product_id", "store_id");

-- CreateIndex
CREATE INDEX "analitika_reason_codes_account_id_active_idx" ON "analitika_reason_codes"("account_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "analitika_reason_codes_account_id_label_key" ON "analitika_reason_codes"("account_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "analitika_variance_configs_account_id_key" ON "analitika_variance_configs"("account_id");

-- CreateIndex
CREATE INDEX "analitika_orders_account_id_created_at_idx" ON "analitika_orders"("account_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "analitika_orders_account_id_number_key" ON "analitika_orders"("account_id", "number");

-- CreateIndex
CREATE INDEX "analitika_order_lines_order_id_idx" ON "analitika_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "analitika_order_lines_account_id_product_id_idx" ON "analitika_order_lines"("account_id", "product_id");

-- AddForeignKey
ALTER TABLE "analitika_order_lines" ADD CONSTRAINT "analitika_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "analitika_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

