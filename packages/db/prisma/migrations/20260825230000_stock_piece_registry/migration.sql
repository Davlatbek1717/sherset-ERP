-- K1 (bo'linadigan tovar — kabel/sim/shlang, K-reja `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`)
--
-- Ikki narsa qo'shiladi va HECH NARSA o'zgartirilmaydi:
--   1. `products.piece_tracked` — «Bo'lak hisobi yuritilsin» bayrog'i, default FALSE
--      ⇒ mavjud 5000+ tovarning birortasi ham xulqini o'zgartirmaydi;
--   2. `stock_pieces` — bo'lak reyestri, BO'SH jadval.
--
-- 🔷 Jonli XULQQA TA'SIRI: YO'Q. K1 da bayroq hech qayerda yoqilmaydi, jadvalga
-- hech kim yozmaydi, va uni o'qiydigan yagona joy — sverka hisoboti
-- (`GET /stock-pieces/reconciliation`, faqat o'qish). Qoldiq ayirish mantiqi
-- (`stock.service`, `retail-sale.service`) bu jadvalni UMUMAN ko'rmaydi.
-- Sabab ataylab: 2026-08-24 da kassa aynan qoldiq mexanizmiga tegilgani uchun
-- 46 daqiqa to'xtagan edi (`docs/plans/2026-08-24-split-kassa-hodisasi.md`).
--
-- CHECK cheklovlari — modelning uch qat'iy qoidasi SQL darajasida:
--   * `whole = true ⟹ label IS NULL` (K-Q3: butun rulonlar almashtiriladigan va
--     yorliqsiz; yorliq faqat individ bo'lakda ma'noga ega);
--   * uzunlik manfiy bo'lmaydi, FAOL bo'lak esa qat'iy musbat (nol uzunlikdagi
--     «bor» bo'lak sverkani jimgina chalg'itardi — silent-wrong-0 tuzog'i);
--   * `status` yopiq lug'at: notanish holat sverkadan jimgina tushib qolardi.
--   ⚠️ Lokal `prisma db push` bilan qurilgan bazada CHECK'lar BO'LMAYDI (push
--   sxemadan quradi, sxema esa CHECK'ni ifodalay olmaydi) — shuning uchun ayni
--   qoidalar `apps/api/src/modules/stock-piece/stock-piece-core.ts` guardida
--   ham bor va testlar bilan qulflangan. Ikki qavat ataylab.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish no-op.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "piece_tracked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "stock_pieces" (
  "id"              UUID           NOT NULL,
  "account_id"      UUID           NOT NULL,
  "store_id"        UUID           NOT NULL,
  "cell_id"         UUID,
  "assortment_kind" VARCHAR(20)    NOT NULL DEFAULT 'product',
  "assortment_id"   UUID           NOT NULL,
  "length"          DECIMAL(20, 6) NOT NULL,
  "whole"           BOOLEAN        NOT NULL DEFAULT false,
  "label"           VARCHAR(40),
  "source_piece_id" UUID,
  "status"          VARCHAR(20)    NOT NULL DEFAULT 'active',
  "created_at"      TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumed_at"     TIMESTAMPTZ,

  CONSTRAINT "stock_pieces_pkey" PRIMARY KEY ("id"),

  -- K-Q3 — butun rulon YORLIQSIZ.
  CONSTRAINT "stock_pieces_whole_has_no_label"
    CHECK (NOT "whole" OR "label" IS NULL),

  -- Manfiy uzunlik sverkani teskarisiga ag'darardi.
  CONSTRAINT "stock_pieces_length_nonnegative"
    CHECK ("length" >= 0),

  -- FAOL bo'lak qat'iy musbat. `consumed` da 0 RUXSAT: bo'lak «tugadi» deb
  -- yopilganda qog'ozda qolgan uzunlik hisobdan chiqariladi (K-reja 5-bo'lim).
  CONSTRAINT "stock_pieces_active_length_positive"
    CHECK ("status" <> 'active' OR "length" > 0),

  -- Yopiq holat lug'ati.
  CONSTRAINT "stock_pieces_status_known"
    CHECK ("status" IN ('active', 'consumed'))
);

DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT: bo'lagi bor ombor jimgina o'chmasin (`stock_by_cell` naqshi).
DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL: yacheyka o'chsa bo'lak ombor darajasiga TUSHADI. RESTRICT bo'lsa
-- yacheyka o'chirish bloklanardi, CASCADE bo'lsa jismonan omborda turgan
-- bo'lak hisobdan JIMGINA yo'qolardi va sverka farq bera boshlardi.
DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_cell_id_fkey"
    FOREIGN KEY ("cell_id") REFERENCES "store_cells"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL: manba bo'lak o'chsa bola YETIM qoladi, lekin yo'qolmaydi (kesim
-- tarixi ma'lumot, bo'lakning o'zi esa jismoniy haqiqat).
DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_source_piece_id_fkey"
    FOREIGN KEY ("source_piece_id") REFERENCES "stock_pieces"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Yorliq UNIKAL (K-reja 7.3) — akkaunt ichida. NULL lar cheklanmaydi (Postgres
-- unikal indeksida NULL lar teng emas) ⇒ yorliqsiz butun rulonlar cheksiz.
CREATE UNIQUE INDEX IF NOT EXISTS "stock_pieces_account_id_label_key"
  ON "stock_pieces"("account_id", "label");

CREATE INDEX IF NOT EXISTS "stock_pieces_account_store_assortment_status_idx"
  ON "stock_pieces"("account_id", "store_id", "assortment_kind", "assortment_id", "status");

CREATE INDEX IF NOT EXISTS "stock_pieces_cell_id_idx"
  ON "stock_pieces"("cell_id");

CREATE INDEX IF NOT EXISTS "stock_pieces_source_piece_id_idx"
  ON "stock_pieces"("source_piece_id");
