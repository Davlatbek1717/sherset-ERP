-- G4 (Q1-v2, egasi 2026-08-24) — chek qatorining KO'P OMBORLI taqsimoti.
--
-- Nega yangi JADVAL, `retail_sale_positions` ga ustun emas: egasining 3-qoidasi
-- («hech bir yacheyka yolg'iz qoplamasa — bo'linadi») bitta pozitsiyani BIR
-- NECHTA yacheykaga bo'ladi. Bitta `cell_id` ustuni buni ifodalay olmaydi, va
-- pozitsiyani sun'iy ravishda ko'paytirish chek summasi/chegirma hisobini
-- (`computePositionTotal`, frozen narxlar) buzardi.
--
-- `cell_id` NULL bo'lishi ATAYLAB (G-reja E1): jonlida qoldiqning ~94 % i hech
-- bir yacheykaga biriktirilmagan, u holda manba «ombor darajasidagi yacheykasiz
-- qoldiq» bo'ladi.
--
-- FK siyosati:
--   position — CASCADE (qator o'chsa taqsimoti ham ketadi);
--   store    — RESTRICT (taqsimoti bor ombor jimgina o'chmasin);
--   cell     — SET NULL (yacheyka o'chsa taqsimot ombor darajasiga tushadi,
--              qoldiq izi yo'qolmaydi — `sales_returns.retail_sale_id` naqshi).
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lishi SHART.

CREATE TABLE IF NOT EXISTS "retail_sale_position_allocations" (
  "id"          UUID           NOT NULL,
  "account_id"  UUID           NOT NULL,
  "position_id" UUID           NOT NULL,
  "store_id"    UUID           NOT NULL,
  "cell_id"     UUID,
  "qty"         DECIMAL(20, 6) NOT NULL,
  "manual"      BOOLEAN        NOT NULL DEFAULT false,
  "created_at"  TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_sale_position_allocations_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "retail_sale_position_allocations"
    ADD CONSTRAINT "retail_sale_position_allocations_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "retail_sale_position_allocations"
    ADD CONSTRAINT "retail_sale_position_allocations_position_id_fkey"
    FOREIGN KEY ("position_id") REFERENCES "retail_sale_positions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "retail_sale_position_allocations"
    ADD CONSTRAINT "retail_sale_position_allocations_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "retail_sale_position_allocations"
    ADD CONSTRAINT "retail_sale_position_allocations_cell_id_fkey"
    FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "retail_sale_position_allocations_position_id_idx"
  ON "retail_sale_position_allocations"("position_id");

CREATE INDEX IF NOT EXISTS "retail_sale_position_allocations_account_id_store_id_cell_id_idx"
  ON "retail_sale_position_allocations"("account_id", "store_id", "cell_id");
