-- CreateTable
CREATE TABLE "moves" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "organization_id" UUID NOT NULL,
    "source_store_id" UUID NOT NULL,
    "destination_store_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_positions" (
    "id" UUID NOT NULL,
    "move_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "cost_minor" BIGINT,

    CONSTRAINT "move_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "losses" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reason" VARCHAR(30) NOT NULL DEFAULT 'other',
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "losses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_positions" (
    "id" UUID NOT NULL,
    "loss_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "cost_minor" BIGINT,

    CONSTRAINT "loss_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enters" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "reason" VARCHAR(30) NOT NULL DEFAULT 'other',
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "enters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enter_positions" (
    "id" UUID NOT NULL,
    "enter_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "cost_minor" BIGINT NOT NULL,

    CONSTRAINT "enter_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "external_code" VARCHAR(50),
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMPTZ,
    "description" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_positions" (
    "id" UUID NOT NULL,
    "inventory_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "product_id" UUID,
    "expected_qty" DECIMAL(20,6) NOT NULL,
    "actual_qty" DECIMAL(20,6) NOT NULL,
    "variance_qty" DECIMAL(20,6) NOT NULL,
    "cost_minor" BIGINT,

    CONSTRAINT "inventory_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moves_account_id_state_deleted_at_idx" ON "moves"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "moves_account_id_source_store_id_idx" ON "moves"("account_id", "source_store_id");

-- CreateIndex
CREATE INDEX "moves_account_id_destination_store_id_idx" ON "moves"("account_id", "destination_store_id");

-- CreateIndex
CREATE INDEX "moves_account_id_moment_idx" ON "moves"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "moves_account_id_owner_id_idx" ON "moves"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "moves_account_id_name_key" ON "moves"("account_id", "name");

-- CreateIndex
CREATE INDEX "move_positions_move_id_position_idx" ON "move_positions"("move_id", "position");

-- CreateIndex
CREATE INDEX "move_positions_account_id_assortment_kind_assortment_id_idx" ON "move_positions"("account_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "losses_account_id_state_deleted_at_idx" ON "losses"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "losses_account_id_store_id_idx" ON "losses"("account_id", "store_id");

-- CreateIndex
CREATE INDEX "losses_account_id_moment_idx" ON "losses"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "losses_account_id_owner_id_idx" ON "losses"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "losses_account_id_name_key" ON "losses"("account_id", "name");

-- CreateIndex
CREATE INDEX "loss_positions_loss_id_position_idx" ON "loss_positions"("loss_id", "position");

-- CreateIndex
CREATE INDEX "loss_positions_account_id_assortment_kind_assortment_id_idx" ON "loss_positions"("account_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "enters_account_id_state_deleted_at_idx" ON "enters"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "enters_account_id_store_id_idx" ON "enters"("account_id", "store_id");

-- CreateIndex
CREATE INDEX "enters_account_id_moment_idx" ON "enters"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "enters_account_id_owner_id_idx" ON "enters"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "enters_account_id_name_key" ON "enters"("account_id", "name");

-- CreateIndex
CREATE INDEX "enter_positions_enter_id_position_idx" ON "enter_positions"("enter_id", "position");

-- CreateIndex
CREATE INDEX "enter_positions_account_id_assortment_kind_assortment_id_idx" ON "enter_positions"("account_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "inventories_account_id_state_deleted_at_idx" ON "inventories"("account_id", "state", "deleted_at");

-- CreateIndex
CREATE INDEX "inventories_account_id_store_id_idx" ON "inventories"("account_id", "store_id");

-- CreateIndex
CREATE INDEX "inventories_account_id_moment_idx" ON "inventories"("account_id", "moment" DESC);

-- CreateIndex
CREATE INDEX "inventories_account_id_owner_id_idx" ON "inventories"("account_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventories_account_id_name_key" ON "inventories"("account_id", "name");

-- CreateIndex
CREATE INDEX "inventory_positions_inventory_id_position_idx" ON "inventory_positions"("inventory_id", "position");

-- CreateIndex
CREATE INDEX "inventory_positions_account_id_assortment_kind_assortment_i_idx" ON "inventory_positions"("account_id", "assortment_kind", "assortment_id");

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_source_store_id_fkey" FOREIGN KEY ("source_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_destination_store_id_fkey" FOREIGN KEY ("destination_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_positions" ADD CONSTRAINT "move_positions_move_id_fkey" FOREIGN KEY ("move_id") REFERENCES "moves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_positions" ADD CONSTRAINT "move_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "losses" ADD CONSTRAINT "losses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "losses" ADD CONSTRAINT "losses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "losses" ADD CONSTRAINT "losses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "losses" ADD CONSTRAINT "losses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_positions" ADD CONSTRAINT "loss_positions_loss_id_fkey" FOREIGN KEY ("loss_id") REFERENCES "losses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_positions" ADD CONSTRAINT "loss_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enters" ADD CONSTRAINT "enters_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enters" ADD CONSTRAINT "enters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enters" ADD CONSTRAINT "enters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enters" ADD CONSTRAINT "enters_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enter_positions" ADD CONSTRAINT "enter_positions_enter_id_fkey" FOREIGN KEY ("enter_id") REFERENCES "enters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enter_positions" ADD CONSTRAINT "enter_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_positions" ADD CONSTRAINT "inventory_positions_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_positions" ADD CONSTRAINT "inventory_positions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
