-- Address storage Phase 4 — per-cell stock (StockByCell) + cell references.
-- Adds cell_id to enter/loss positions (validated FK → store_cells, SetNull),
-- cell_id to the stock_operations ledger (informational), and the materialized
-- per-cell balance table stock_by_cell (cell FK Restrict = can't drop a non-empty
-- cell). ONLY these statements — unrelated working-tree drift is out of scope.

-- AlterTable
ALTER TABLE "enter_positions" ADD COLUMN     "cell_id" UUID;

-- AlterTable
ALTER TABLE "loss_positions" ADD COLUMN     "cell_id" UUID;

-- AlterTable
ALTER TABLE "stock_operations" ADD COLUMN     "cell_id" UUID;

-- CreateTable
CREATE TABLE "stock_by_cell" (
    "account_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "cell_id" UUID NOT NULL,
    "assortment_kind" VARCHAR(20) NOT NULL DEFAULT 'product',
    "assortment_id" UUID NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stock_by_cell_pkey" PRIMARY KEY ("account_id","store_id","cell_id","assortment_kind","assortment_id")
);

-- CreateIndex
CREATE INDEX "stock_by_cell_account_id_store_id_assortment_kind_assortmen_idx" ON "stock_by_cell"("account_id", "store_id", "assortment_kind", "assortment_id");

-- CreateIndex
CREATE INDEX "stock_by_cell_cell_id_idx" ON "stock_by_cell"("cell_id");

-- CreateIndex
CREATE INDEX "enter_positions_cell_id_idx" ON "enter_positions"("cell_id");

-- CreateIndex
CREATE INDEX "loss_positions_cell_id_idx" ON "loss_positions"("cell_id");

-- AddForeignKey
ALTER TABLE "loss_positions" ADD CONSTRAINT "loss_positions_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enter_positions" ADD CONSTRAINT "enter_positions_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_by_cell" ADD CONSTRAINT "stock_by_cell_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_by_cell" ADD CONSTRAINT "stock_by_cell_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_by_cell" ADD CONSTRAINT "stock_by_cell_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
