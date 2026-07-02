-- CreateTable
CREATE TABLE "cash_in" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cash_desk_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "payment_purpose" VARCHAR(500),
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "cash_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_in_operations" (
    "id" UUID NOT NULL,
    "cash_in_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "target_kind" VARCHAR(20) NOT NULL DEFAULT 'invoiceout',
    "invoice_out_id" UUID,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "cash_in_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_out" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "agent_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cash_desk_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_value" BIGINT NOT NULL DEFAULT 100000000,
    "payment_purpose" VARCHAR(500),
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "cash_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_out_operations" (
    "id" UUID NOT NULL,
    "cash_out_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "target_kind" VARCHAR(20) NOT NULL DEFAULT 'invoicein',
    "invoice_in_id" UUID,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "cash_out_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_in_account_id_state_deleted_at_idx" ON "cash_in"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "cash_in_account_id_agent_id_idx" ON "cash_in"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "cash_in_account_id_moment_idx" ON "cash_in"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "cash_in_account_id_cash_desk_id_idx" ON "cash_in"("account_id", "cash_desk_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_in_account_id_name_key" ON "cash_in"("account_id", "name");

-- CreateIndex
CREATE INDEX "cash_in_operations_cash_in_id_idx" ON "cash_in_operations"("cash_in_id");

-- CreateIndex
CREATE INDEX "cash_in_operations_account_id_invoice_out_id_idx" ON "cash_in_operations"("account_id", "invoice_out_id");

-- CreateIndex
CREATE INDEX "cash_out_account_id_state_deleted_at_idx" ON "cash_out"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "cash_out_account_id_agent_id_idx" ON "cash_out"("account_id", "agent_id");

-- CreateIndex
CREATE INDEX "cash_out_account_id_moment_idx" ON "cash_out"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "cash_out_account_id_cash_desk_id_idx" ON "cash_out"("account_id", "cash_desk_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_out_account_id_name_key" ON "cash_out"("account_id", "name");

-- CreateIndex
CREATE INDEX "cash_out_operations_cash_out_id_idx" ON "cash_out_operations"("cash_out_id");

-- CreateIndex
CREATE INDEX "cash_out_operations_account_id_invoice_in_id_idx" ON "cash_out_operations"("account_id", "invoice_in_id");

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in" ADD CONSTRAINT "cash_in_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in_operations" ADD CONSTRAINT "cash_in_operations_cash_in_id_fkey" FOREIGN KEY ("cash_in_id") REFERENCES "cash_in"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_in_operations" ADD CONSTRAINT "cash_in_operations_invoice_out_id_fkey" FOREIGN KEY ("invoice_out_id") REFERENCES "invoices_out"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out" ADD CONSTRAINT "cash_out_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out_operations" ADD CONSTRAINT "cash_out_operations_cash_out_id_fkey" FOREIGN KEY ("cash_out_id") REFERENCES "cash_out"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_out_operations" ADD CONSTRAINT "cash_out_operations_invoice_in_id_fkey" FOREIGN KEY ("invoice_in_id") REFERENCES "invoices_in"("id") ON DELETE SET NULL ON UPDATE CASCADE;
