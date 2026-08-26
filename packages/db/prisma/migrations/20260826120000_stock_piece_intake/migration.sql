-- K5 (bo'linadigan tovar — OMMAVIY KIRITISH: inventarizatsiya + priyomka + vozvrat)
-- Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K5 fazasi.
--
-- Uchta hujjat jadvaliga BITTA ixtiyoriy matn ustuni qo'shiladi va bitta
-- mavjud CHECK kengaytiriladi. Hech bir mavjud qatorning ma'nosi siljimaydi
-- (hammasi NULL bilan keladi).
--
--   1. `inventory_positions.piece_entry` — omborchi SANAGAN tarkib
--      («250x3+BLK-000041:200+?:150»). Post paytida reyestr shu tarkibga
--      TENGLASHTIRILADI (mutlaq amal — omborchining ko'zi haqiqat manbai).
--   2. `supply_positions.piece_entry` — kelgan RULONLAR («250x5»). Post
--      paytida har rulon reyestrga `whole=true` qator bo'lib tushadi.
--   3. `sales_return_positions.piece_entry` — mijozdan qaytgan bo'lak
--      («BLK-000041:180»). Post paytida bo'lak reyestrga QAYTADI.
--   4. `stock_pieces_consumed_reason_known` CHECK ga `recount` qo'shiladi —
--      «sanashda topilmadi». Alohida sabab ATAYLAB: `closed` («tugadi»,
--      qo'lda) bilan aralashsa sverkadagi farqning MANBAI ko'rinmay qolardi.
--
-- 🔷 QOLDIQQA TA'SIRI: YO'Q. Bu migratsiyada `stocks` / `stock_by_cell`
-- so'zlari umuman uchramaydi. Uchala ustun ham hujjat MATNI — qoldiqni
-- hujjatlarning O'Z posting yo'llari (inventory/supply/sales-return) avvalgidek
-- o'zgartiradi, bu ustunlar esa faqat `stock_pieces` reyestrini hizalaydi.
--
-- 🔷 JONLI XULQQA TA'SIRI: YO'Q. Ustunlar NULL bilan keladi; reyestr yo'li
-- FAQAT `products.piece_tracked = true` tovarda va FAQAT ustun to'ldirilganda
-- ishga tushadi. Jonlida bayroq hech bir tovarda yoqilmagan (K1 lokal o'lchovi:
-- 5086 tovarning hammasida `false`) va `stock_pieces` BO'SH.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish no-op.

ALTER TABLE "inventory_positions" ADD COLUMN IF NOT EXISTS "piece_entry" TEXT;
ALTER TABLE "supply_positions" ADD COLUMN IF NOT EXISTS "piece_entry" TEXT;
ALTER TABLE "sales_return_positions" ADD COLUMN IF NOT EXISTS "piece_entry" TEXT;

-- Yopiq lug'atni KENGAYTIRISH: `DROP IF EXISTS` + `ADD` — `duplicate_object`
-- bilan yutish bu yerda YARAMAYDI, chunki eski (K4) cheklov nomi AYNI va u
-- `recount` ni rad etardi. Ikki qadam birgalikda idempotent: qayta yugurtirish
-- ayni cheklovni ayni holatga qo'yadi.
--
-- ⚠️ DROP va ADD orasida cheklov qisqa vaqt YO'Q bo'ladi. Xavfsiz, chunki
-- ikkalasi bitta migratsiya tranzaksiyasida ketadi (prisma db execute har
-- faylni bitta tranzaksiyada yuritadi) va `consumed_reason` ga yozadigan
-- yagona kod yo'li yopiq lug'atdan (`PIECE_CONSUMED_REASON`) foydalanadi.
ALTER TABLE "stock_pieces" DROP CONSTRAINT IF EXISTS "stock_pieces_consumed_reason_known";
ALTER TABLE "stock_pieces"
  ADD CONSTRAINT "stock_pieces_consumed_reason_known"
  CHECK ("consumed_reason" IS NULL
         OR "consumed_reason" IN ('sold', 'scrap', 'cut-loss', 'closed', 'recount'));
