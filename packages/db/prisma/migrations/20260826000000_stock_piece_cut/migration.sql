-- K4 (bo'linadigan tovar — omborchi KESIM oqimi + posting)
-- Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K4 fazasi.
--
-- Uchta jadvalga FAQAT QO'SHILADI, hech narsa o'zgartirilmaydi va hech bir
-- mavjud qatorning ma'nosi siljimaydi (hammasi NULL bilan keladi):
--
--   1. `stock_pieces.reserved_sale_id` / `reserved_position_id`
--      — kesilgan bo'lak QAYSI chek qatoriga ajratilgani.
--      🔴 Band bo'lak HAM omborda: kesim STOK-NEYTRAL, qoldiq faqat to'lovda
--      kamayadi (K-reja 2-bo'lim). Ya'ni bu ustunlar sverkaga TA'SIR QILMAYDI.
--   2. `stock_pieces.consumed_reason` — bo'lak nega reyestrdan chiqqani
--      (`sold` | `scrap` | `cut-loss` | `closed`). Egasining 2026-08-25 dagi
--      qarori bo'yicha chiqindi va kesim yo'qotishi FAQAT REYESTRDAN chiqadi,
--      QOLDIQQA TEGILMAYDI — ya'ni sverka farqni ko'rsatadi va uni tuzatish
--      inventarizatsiya ishi (K5). Bu ustun aynan shu farqni tushuntiradi.
--   3. `retail_sale_positions.piece_lengths` — KASSIRNING mijoz bilan
--      kelishgan tarkibi («150+30»). K3 uni faqat savatda saqlardi va u
--      omborchiga yetib bormasdi (K3 hisobotining «ASOSIY qarz» bandi).
--   4. `restock_task_lines.position_id` — yig'ish qatori qaysi chek
--      pozitsiyasidan chiqqani (busiz kesim pozitsiyani TAXMIN qilardi).
--
-- 🔷 Jonli XULQQA TA'SIRI: YO'Q. Ustunlar NULL, `stock_pieces` jonlida BO'SH,
-- `products.piece_tracked` esa hech bir tovarda yoqilmagan (K1 lokal o'lchovi:
-- 5086 tovarning hammasida `false`). Qoldiq ayirish mantiqi
-- (`stock.service`) bu ustunlarni UMUMAN ko'rmaydi.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish no-op.

ALTER TABLE "stock_pieces" ADD COLUMN IF NOT EXISTS "reserved_sale_id" UUID;
ALTER TABLE "stock_pieces" ADD COLUMN IF NOT EXISTS "reserved_position_id" UUID;
ALTER TABLE "stock_pieces" ADD COLUMN IF NOT EXISTS "consumed_reason" VARCHAR(20);

ALTER TABLE "retail_sale_positions" ADD COLUMN IF NOT EXISTS "piece_lengths" TEXT;

ALTER TABLE "restock_task_lines" ADD COLUMN IF NOT EXISTS "position_id" UUID;

-- SET NULL: chek bekor qilinsa yoki qatori kontrol tomonidan o'chirilsa
-- kesilgan bo'lak omborda YORLIG'I bilan qolaveradi (K-reja 2-bo'lim: «mijoz
-- kesilgandan keyin voz kechsa hech nima buzilmaydi»). CASCADE bo'lsa jismonan
-- omborda yotgan 180 m lik bo'lak hisobdan JIM yo'qolardi; RESTRICT bo'lsa
-- kassir bekor qilingan chekni hech qachon o'chira olmasdi.
DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_reserved_sale_id_fkey"
    FOREIGN KEY ("reserved_sale_id") REFERENCES "retail_sales"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_reserved_position_id_fkey"
    FOREIGN KEY ("reserved_position_id") REFERENCES "retail_sale_positions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL: chek qatori o'chsa yig'ish topshirig'i qatori YO'QOLMAYDI —
-- omborchining bajargan ishi (tasdiq/yetishmovchilik izi) hujjat sifatida qoladi.
DO $$ BEGIN
  ALTER TABLE "restock_task_lines"
    ADD CONSTRAINT "restock_task_lines_position_id_fkey"
    FOREIGN KEY ("position_id") REFERENCES "retail_sale_positions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Yopiq lug'at: notanish sabab sverkadagi farqni tushuntirmay qo'yardi
-- (K1 dagi `stock_pieces_status_known` bilan bir naqsh).
DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_consumed_reason_known"
    CHECK ("consumed_reason" IS NULL
           OR "consumed_reason" IN ('sold', 'scrap', 'cut-loss', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FAOL bo'lak sabab bilan turolmaydi: sabab faqat `consumed` ga tegishli.
DO $$ BEGIN
  ALTER TABLE "stock_pieces"
    ADD CONSTRAINT "stock_pieces_reason_only_when_consumed"
    CHECK ("consumed_reason" IS NULL OR "status" = 'consumed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "stock_pieces_account_reserved_position_idx"
  ON "stock_pieces"("account_id", "reserved_position_id");

CREATE INDEX IF NOT EXISTS "stock_pieces_account_reserved_sale_idx"
  ON "stock_pieces"("account_id", "reserved_sale_id");

CREATE INDEX IF NOT EXISTS "restock_task_lines_position_id_idx"
  ON "restock_task_lines"("position_id");
