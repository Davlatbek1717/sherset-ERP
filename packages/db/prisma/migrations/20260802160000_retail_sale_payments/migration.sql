-- Kassa TZ §6 — aralash to'lov (multi-tender).
--
-- Sabab: /sotuv to'lov oynasi 4 turni yuborardi (naqd/karta/terminal/qarz),
-- server 2 tasini bilardi → terminal chek 400 olardi. Bu jadval o'sha
-- interfeysning serverdagi juftligi.
--
-- RetailSale.cash_amount_minor / card_amount_minor O'CHIRILMAYDI — TZ §6.3
-- bo'yicha ular shu qatorlardan hisoblanadi (orqaga moslik).
--
-- Qaytarish: DROP TABLE "retail_sale_payments";

-- CreateTable
CREATE TABLE "retail_sale_payments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "rate_minor" BIGINT,
    "amount_base_minor" BIGINT NOT NULL,
    "reference" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retail_sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retail_sale_payments_account_id_sale_id_idx" ON "retail_sale_payments"("account_id", "sale_id");

-- CreateIndex
CREATE INDEX "retail_sale_payments_account_id_method_created_at_idx" ON "retail_sale_payments"("account_id", "method", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "retail_sale_payments" ADD CONSTRAINT "retail_sale_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_payments" ADD CONSTRAINT "retail_sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "retail_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

