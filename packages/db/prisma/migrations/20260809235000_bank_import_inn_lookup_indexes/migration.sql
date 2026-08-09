-- Faza Q9 (QOLDIQ-REJA) — bank-import auto-match kontragent lookup'i (`DB-05`).
--
-- `bank-import.service.ts::buildMatchMap` ilgari BUTUN `counterparties`
-- jadvalini RAM'ga yuklab JS'da solishtirardi. Endi u bitta SQL-lookup
-- yuboradi:
--
--   WHERE account_id = $1 AND archived = false
--     AND ( (uz_requisites #>> '{inn}'::text[])     = ANY($2::text[])
--        OR (uz_requisites #>> '{account}'::text[]) = ANY($3::text[])
--        OR code                                    = ANY($2::text[]) )
--
-- ⚠️ IFODA AYNAN MOS BO'LISHI SHART. Postgres expression-indeksni parse-daraxt
-- tengligi bo'yicha tanlaydi: `->>` yozilsa (boshqa funksiya) indeks jimgina
-- ishlatilmay qoladi. Faza 25 aynan shu xatoni tutgan — shuning uchun quyidagi
-- ifodalar servisdagi SQL bilan belgi-ma-belgi bir xil, va unit-test SQL matnini
-- qulflaydi.
--
-- Uchala indeks ham KERAK: OR-shoxlarining bittasi indekssiz qolsa planner
-- butun so'rovni Seq Scan qiladi va INN indeksi FOYDASIZ bo'lardi
-- (o'lchangan: 30k qatorda 3 indekssiz OR → Seq Scan 19.9 ms).
--
-- `counterparties_inn_trgm_idx` (Faza 25, GIN gin_trgm_ops) O'RNINI BOSMAYDI:
-- u `LIKE '%…%'` uchun; teng-solishtirishda ham ishlaydi, lekin narxi 596 va
-- 168 buffer (btree — 1.005 va 3 buffer).
--
-- ⛔ UNIQUE QO'YILMAYDI (na bu yerda, na `bank_statement_rows` da): prod
-- dublikatlari hali O'LCHANMAGAN (OPS-4 bandi) — unique indeks migratsiyani
-- prodda yiqitardi.
--
-- CREATE INDEX SHARE qulfini oladi (jadvalga yozishni bloklaydi) — jadval
-- kichik, soniyalar, lekin past yuklamada qo'llang. CONCURRENTLY ishlatilmaydi:
-- Prisma migratsiyani tranzaksiya ichida yuritadi.
--
-- IF NOT EXISTS: deploy DB'lari `_prisma_migrations`-tracked emas, bu fayl
-- qo'lda `prisma db execute --file` bilan ham qo'llanadi ⇒ qayta yugurtirish
-- no-op bo'lishi shart.

-- DB-05 — INN bo'yicha TENG-solishtirish (btree, expression).
-- CreateIndex
CREATE INDEX IF NOT EXISTS "counterparties_inn_expr_idx"
  ON "counterparties" ((("uz_requisites" #>> '{inn}'::text[])));

-- DB-05 — kontragent bank hisob raqami bo'yicha teng-solishtirish (btree, expression).
-- CreateIndex
CREATE INDEX IF NOT EXISTS "counterparties_bank_account_expr_idx"
  ON "counterparties" ((("uz_requisites" #>> '{account}'::text[])));

-- DB-05 — `code` shoxi (ba'zi kontragentlarda INN aynan `code`da turadi).
-- Bu Prisma-da ifodalanadi ⇒ schema.prisma'da ham bor (`@@index([accountId, code])`).
-- CreateIndex
CREATE INDEX IF NOT EXISTS "counterparties_account_id_code_idx"
  ON "counterparties"("account_id", "code");
