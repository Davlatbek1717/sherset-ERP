-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "content" BYTEA NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_images_account_id_product_id_position_idx" ON "product_images"("account_id", "product_id", "position");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
