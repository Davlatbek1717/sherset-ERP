-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "price_type_id" UUID;

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparty_accounts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "account_number" VARCHAR(50) NOT NULL,
    "bank_name" VARCHAR(255),
    "bank_location" VARCHAR(255),
    "correspondent_account" VARCHAR(50),
    "mfo" VARCHAR(10),
    "bank_inn" VARCHAR(20),
    "swift" VARCHAR(20),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "counterparty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "groups_account_id_idx" ON "groups"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_account_id_name_key" ON "groups"("account_id", "name");

-- CreateIndex
CREATE INDEX "counterparty_accounts_account_id_counterparty_id_idx" ON "counterparty_accounts"("account_id", "counterparty_id");

-- CreateIndex
CREATE INDEX "counterparty_accounts_counterparty_id_is_main_idx" ON "counterparty_accounts"("counterparty_id", "is_main");

-- CreateIndex
CREATE INDEX "counterparties_group_id_idx" ON "counterparties"("group_id");

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_price_type_id_fkey" FOREIGN KEY ("price_type_id") REFERENCES "price_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_accounts" ADD CONSTRAINT "counterparty_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparty_accounts" ADD CONSTRAINT "counterparty_accounts_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
