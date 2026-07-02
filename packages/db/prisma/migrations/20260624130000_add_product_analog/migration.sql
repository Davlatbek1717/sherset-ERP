-- CreateTable
CREATE TABLE "product_analogs" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "analog_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_analogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_analogs_account_id_idx" ON "product_analogs"("account_id");

-- CreateIndex
CREATE INDEX "product_analogs_product_id_idx" ON "product_analogs"("product_id");

-- CreateIndex
CREATE INDEX "product_analogs_analog_id_idx" ON "product_analogs"("analog_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_analogs_product_id_analog_id_key" ON "product_analogs"("product_id", "analog_id");

-- AddForeignKey
ALTER TABLE "product_analogs" ADD CONSTRAINT "product_analogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogs" ADD CONSTRAINT "product_analogs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogs" ADD CONSTRAINT "product_analogs_analog_id_fkey" FOREIGN KEY ("analog_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
