-- moysklad «Ячейка» (address-storage bin) on sales-return positions.
-- Mirrors purchase_return_positions.cell_id/cell — the returned goods are
-- placed INTO a specific cell, so cell_id drives per-cell stock (StockByCell)
-- on post.

ALTER TABLE "sales_return_positions" ADD COLUMN "cell_id" UUID;
ALTER TABLE "sales_return_positions" ADD COLUMN "cell" VARCHAR(255);

ALTER TABLE "sales_return_positions"
  ADD CONSTRAINT "sales_return_positions_cell_id_fkey"
  FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sales_return_positions_cell_id_idx" ON "sales_return_positions"("cell_id");
