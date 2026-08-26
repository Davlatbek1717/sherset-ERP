-- QAYTARISH YO'LI (F-reja 2-bo'lim, 12-qoida) — K6 migratsiyasining TESKARISI.
--
-- Migratsiya faqat QO'SHADI: `products` ga ikkita NULL ustun
-- (`piece_tracked_decided_at`, `piece_tracked_decided_by_id`) va ular uchun
-- bitta FK. Birorta MAVJUD ustun o'zgarmagan, birorta qator ko'chirilmagan ⇒
-- qaytarish qoldiqqa (`stocks` / `stock_by_cell`), bo'lak reyestriga
-- (`stock_pieces`), chekka, kassaga va yacheykalarga TEGMAYDI.
--
-- 🔴 MA'LUMOT YO'QOLADI (faqat K6 doirasida):
--   (a) qaysi tovar bo'yicha bayroq QARORI qilingani (sana) — ya'ni
--       qaytarishdan keyin «Hal qilinmagan» ro'yxati (agar kodi qolsa) BUTUN
--       «m» katalogini qaytadan ko'rsatadi. Bayroqning O'ZI
--       (`products.piece_tracked`) TEGILMAYDI: yoqilgan tovar yoqilganicha
--       qoladi va kassa xulqi (K3 taqsimot istisnosi) o'zgarmaydi.
--   (b) qarorni KIM qilgani.
--
--   Qaytarishdan OLDIN EKSPORT qiling (qaror tarixi boshqa hech qayerda yo'q):
--     \copy (SELECT id, name, code, uom, piece_tracked, piece_tracked_decided_at, piece_tracked_decided_by_id FROM "products" WHERE piece_tracked_decided_at IS NOT NULL) TO 'k6-flag-decisions.csv' CSV HEADER
--
-- TEKSHIRUV (qaytarishdan oldin — nima yo'qolishini raqam bilan ko'ring):
--   SELECT count(*) FILTER (WHERE piece_tracked_decided_at IS NOT NULL) AS qaror_qilingan,
--          count(*) FILTER (WHERE piece_tracked)                        AS bayrogi_yoqilgan
--     FROM "products" WHERE deleted_at IS NULL;
--   Birinchisi 0 bo'lsa qaytarish MUTLAQO izsiz.
--
-- BUYRUQ:
--   cd packages/db && npx prisma db execute --schema prisma/schema.prisma \
--     --file scripts/rollback/20260826170000_piece_tracking_decision_down.sql
--   npx prisma migrate resolve --rolled-back 20260826170000_piece_tracking_decision
--   npx prisma generate
--
-- Har qadam idempotent: ikkinchi yugurish to'liq no-op.
-- (FK ustun bilan birga o'zi tushadi — alohida DROP CONSTRAINT kerak emas,
--  lekin ustun allaqachon yo'q bo'lgan bazada ham yiqilmasligi uchun
--  `IF EXISTS` qo'yilgan.)

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_piece_tracked_decided_by_id_fkey";
ALTER TABLE "products" DROP COLUMN IF EXISTS "piece_tracked_decided_by_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "piece_tracked_decided_at";
