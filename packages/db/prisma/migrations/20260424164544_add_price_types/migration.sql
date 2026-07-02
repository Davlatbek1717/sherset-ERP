-- CreateTable
CREATE TABLE "price_types" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "price_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_types_account_id_archived_idx" ON "price_types"("account_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "price_types_account_id_name_key" ON "price_types"("account_id", "name");

-- AddForeignKey
ALTER TABLE "price_types" ADD CONSTRAINT "price_types_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
