-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "qty_delta" DECIMAL(20,6) NOT NULL,
    "doc_type" VARCHAR(30) NOT NULL,
    "doc_id" UUID NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_reservations_account_id_store_id_assortment_kind_asso_idx" ON "stock_reservations"("account_id", "store_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "stock_reservations_account_id_doc_type_doc_id_idx" ON "stock_reservations"("account_id", "doc_type", "doc_id");

-- CreateIndex
CREATE INDEX "stock_reservations_account_id_occurred_at_idx" ON "stock_reservations"("account_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
