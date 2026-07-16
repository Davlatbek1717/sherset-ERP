-- Adresli saqlash (moysklad «Адресное хранение товаров» analogi) — ombor
-- yacheykalari REGISTRI (2026-07-16 talab). Har qator = ombor kartochkasida
-- yaratilgan bitta yacheyka: kanonik «NN-NN-NN-NN» kod + ixtiyoriy «polka»
-- yorlig'i (moysklad zonasi o'rnida). Band/bo'shlik bu jadvalda saqlanmaydi —
-- Product.loc* ∪ ProductLocation manzillaridan kod bo'yicha hisoblanadi.
-- Additive: mavjud ma'lumotlarga tegmaydi.

-- CreateTable
CREATE TABLE "store_cells" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "code" VARCHAR(11) NOT NULL,
    "shelf" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "store_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_cells_account_id_store_id_code_key" ON "store_cells"("account_id", "store_id", "code");

-- CreateIndex
CREATE INDEX "store_cells_account_id_store_id_idx" ON "store_cells"("account_id", "store_id");

-- AddForeignKey
ALTER TABLE "store_cells" ADD CONSTRAINT "store_cells_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
