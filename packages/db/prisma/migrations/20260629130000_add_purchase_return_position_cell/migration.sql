-- moysklad «Ячейка» (address-storage bin) on purchase-return positions.
-- Mirrors supply_positions.cell_id/cell — the goods leave FROM a specific cell,
-- so cell_id drives per-cell stock (StockByCell) on post.

ALTER TABLE "purchase_return_positions" ADD COLUMN "cell_id" UUID;
ALTER TABLE "purchase_return_positions" ADD COLUMN "cell" VARCHAR(255);

ALTER TABLE "purchase_return_positions"
  ADD CONSTRAINT "purchase_return_positions_cell_id_fkey"
  FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "purchase_return_positions_cell_id_idx" ON "purchase_return_positions"("cell_id");
