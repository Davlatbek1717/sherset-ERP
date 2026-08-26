-- K6 (bo'linadigan tovar — BAYROQ SIYOSATI) — «qaror qilindimi?» ustunlari.
-- Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K6 fazasi.
--
-- NEGA USTUN KERAK BO'LDI: `products.piece_tracked` — boolean, ya'ni `false`
-- bir vaqtning o'zida IKKI xil narsani anglatadi — «bo'lak hisobi kerak emas
-- deb QAROR QILINDI» va «hali hech kim qaramagan». K6/3-vazifa («hal
-- qilinmagan» ro'yxati) aynan ikkinchisini ko'rsatishi kerak, aks holda yangi
-- nomenklatura jimgina o'tib ketadi va kabel bo'lakka bo'linmay sotilaveradi.
--
--   1. `piece_tracked_decided_at`    — qaror QACHON qilindi (NULL = qaror yo'q).
--   2. `piece_tracked_decided_by_id` — KIM qaror qildi (FK → `employees`,
--      **SET NULL**: xodim ishdan ketsa qaror KUCHDA qoladi, faqat ismi
--      yo'qoladi. CASCADE bo'lsa tovar qayta «hal qilinmagan» bo'lib
--      ro'yxatga qaytardi va K6 pilotining hisobi buzilardi).
--
-- 🔷 QOLDIQQA TA'SIRI: YO'Q. Bu migratsiyada `stocks` / `stock_by_cell` /
-- `stock_pieces` so'zlari umuman uchramaydi. Yagona tegilgan jadval —
-- `products`, unga ham faqat ikkita NULL ustun QO'SHILADI.
--
-- 🔷 JONLI XULQQA TA'SIRI: YO'Q. Ikkala ustun ham NULL bilan keladi, ya'ni
-- deploy kuni HAMMA tovar «qaror qilinmagan» bo'lib turadi va shu holat
-- to'g'ri: jonlida bayroq hech bir tovarda yoqilmagan (K1 lokal o'lchovi —
-- 5086 tovarning hammasida `false`) va haqiqatan ham hech kim hech nima
-- haqida qaror qilmagan. Ro'yxat esa faqat birligi «m» bo'lgan tovarlarni
-- ko'rsatadi (K6/3), ya'ni butun katalog emas.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish no-op.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "piece_tracked_decided_at" TIMESTAMPTZ;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "piece_tracked_decided_by_id" UUID;

DO $$
BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_piece_tracked_decided_by_id_fkey"
    FOREIGN KEY ("piece_tracked_decided_by_id") REFERENCES "employees"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- INDEKS ATAYLAB QO'SHILMADI. «Hal qilinmagan» ro'yxatining so'rovi
-- (`deleted_at IS NULL AND piece_tracked_decided_at IS NULL AND uom IN (…)`)
-- QISMAN indeks talab qilardi, Prisma sxemasi esa `WHERE` li indeksni ifodalay
-- olmaydi ⇒ `prisma migrate diff` da abadiy drift qatori paydo bo'lardi (K1
-- hisobotining «yangi drift-klass YO'Q» intizomi). Jonli katalog 5086 tovar
-- (K1 o'lchovi) va so'rov ekran ochilganda bir marta ketadi — indeks foydasi
-- driftning narxini qoplamaydi. Katalog o'sib ketsa qayta ko'riladi.
