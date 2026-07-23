-- Address storage Phase 5 (Приёмка) — cell reference on supply positions.
-- Receive-into-cell: cell_id FK → store_cells (SetNull); per-cell stock is driven
-- centrally by StockService.applyDeltas when supply.post() threads the cellId.

-- AlterTable
ALTER TABLE "supply_positions" ADD COLUMN     "cell_id" UUID,
ADD COLUMN     "cell" VARCHAR(255);

-- CreateIndex
CREATE INDEX "supply_positions_cell_id_idx" ON "supply_positions"("cell_id");

-- AddForeignKey
ALTER TABLE "supply_positions" ADD CONSTRAINT "supply_positions_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id") ON DELETE SET NULL ON UPDATE CASCADE;
