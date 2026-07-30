-- «Ячейка» on Отгрузка positions — the address-storage bin the goods leave FROM,
-- so cell_id drives per-cell stock (StockByCell) on post.
-- Mirrors 20260629130000_add_purchase_return_position_cell (the other outbound doc).

ALTER TABLE "demand_positions" ADD COLUMN "cell_id" UUID;
ALTER TABLE "demand_positions" ADD COLUMN "cell" VARCHAR(255);

ALTER TABLE "demand_positions"
  ADD CONSTRAINT "demand_positions_cell_id_fkey"
  FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "demand_positions_cell_id_idx" ON "demand_positions"("cell_id");
