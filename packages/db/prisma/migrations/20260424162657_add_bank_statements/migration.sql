-- CreateTable
CREATE TABLE "bank_statements" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "uploaded_by" UUID,
    "organization_account_id" UUID,
    "filename" VARCHAR(255) NOT NULL,
    "format" VARCHAR(20) NOT NULL DEFAULT 'csv',
    "row_count_total" INTEGER NOT NULL DEFAULT 0,
    "row_count_matched" INTEGER NOT NULL DEFAULT 0,
    "row_count_imported" INTEGER NOT NULL DEFAULT 0,
    "state" VARCHAR(20) NOT NULL DEFAULT 'parsed',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_rows" (
    "id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "counterparty_name" VARCHAR(255),
    "counterparty_inn" VARCHAR(20),
    "counterparty_account" VARCHAR(50),
    "payment_purpose" VARCHAR(500),
    "document_number" VARCHAR(50),
    "matched_counterparty_id" UUID,
    "match_reason" VARCHAR(30),
    "payment_in_id" UUID,
    "payment_out_id" UUID,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "bank_statement_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statements_account_id_created_at_idx" ON "bank_statements"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bank_statement_rows_statement_id_line_number_idx" ON "bank_statement_rows"("statement_id", "line_number");

-- CreateIndex
CREATE INDEX "bank_statement_rows_account_id_matched_counterparty_id_idx" ON "bank_statement_rows"("account_id", "matched_counterparty_id");

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_organization_account_id_fkey" FOREIGN KEY ("organization_account_id") REFERENCES "organization_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_rows" ADD CONSTRAINT "bank_statement_rows_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_rows" ADD CONSTRAINT "bank_statement_rows_matched_counterparty_id_fkey" FOREIGN KEY ("matched_counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_rows" ADD CONSTRAINT "bank_statement_rows_payment_in_id_fkey" FOREIGN KEY ("payment_in_id") REFERENCES "payments_in"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_rows" ADD CONSTRAINT "bank_statement_rows_payment_out_id_fkey" FOREIGN KEY ("payment_out_id") REFERENCES "payments_out"("id") ON DELETE SET NULL ON UPDATE CASCADE;
