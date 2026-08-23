-- Yacheyka bo'yicha inventarizatsiya — InventoryPosition'ga «Ячейка» o'qi.
--
-- `cell_id` = sanalgan StoreCell (SetNull — yacheyka o'chsa hujjat qatori
-- qoladi); `cell` = denormalizatsiya qilingan «Зона / Ячейка» yorlig'i.
-- Yacheykali qatorda post() expectedQty ni StockByCell'dan oladi va variance
-- deltasi cell_id bilan yoziladi (Stock + StockByCell birga tekislanadi).
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — shuning uchun har bir qadam idempotent:
-- qayta yugurtirish no-op bo'lib qolishi shart.

ALTER TABLE "inventory_positions" ADD COLUMN IF NOT EXISTS "cell_id" UUID;
ALTER TABLE "inventory_positions" ADD COLUMN IF NOT EXISTS "cell" VARCHAR(255);

DO $$ BEGIN
  ALTER TABLE "inventory_positions"
    ADD CONSTRAINT "inventory_positions_cell_id_fkey"
    FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "inventory_positions_cell_id_idx"
  ON "inventory_positions"("cell_id");
