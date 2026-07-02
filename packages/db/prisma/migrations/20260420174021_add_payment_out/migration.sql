-- CreateTable
CREATE TABLE "payments_out" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "group_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "payment_purpose" VARCHAR(500),
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "payments_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_out_operations" (
    "id" UUID NOT NULL,
    "payment_out_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "target_kind" VARCHAR(20) NOT NULL DEFAULT 'invoicein',
    "invoice_in_id" UUID,
    "purchase_order_id" UUID,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "payment_out_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_out_account_id_state_deleted_at_idx" ON "payments_out"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "payments_out_account_id_agent_id_idx" ON "payments_out"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "payments_out_account_id_moment_idx" ON "payments_out"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "payments_out_account_id_owner_id_idx" ON "payments_out"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_out_account_id_name_key" ON "payments_out"("account_id", "name");

-- CreateIndex
CREATE INDEX "payment_out_operations_payment_out_id_idx" ON "payment_out_operations"("payment_out_id");

-- CreateIndex
CREATE INDEX "payment_out_operations_account_id_invoice_in_id_idx" ON "payment_out_operations"("account_id", "invoice_in_id");

-- CreateIndex
CREATE INDEX "payment_out_operations_account_id_purchase_order_id_idx" ON "payment_out_operations"("account_id", "purchase_order_id");

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_out" ADD CONSTRAINT "payments_out_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_out_operations" ADD CONSTRAINT "payment_out_operations_payment_out_id_fkey" FOREIGN KEY ("payment_out_id") REFERENCES "payments_out"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_out_operations" ADD CONSTRAINT "payment_out_operations_invoice_in_id_fkey" FOREIGN KEY ("invoice_in_id") REFERENCES "invoices_in"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_out_operations" ADD CONSTRAINT "payment_out_operations_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
