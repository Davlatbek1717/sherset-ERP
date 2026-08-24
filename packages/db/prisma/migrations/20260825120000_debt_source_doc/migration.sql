-- Q1 (2026-08-25) — «Kassadan qo'shilgan qarzdorliklar undirish bo'limida
-- ko'rinmayapti» (egasi). Reja: docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md
--
-- Qarz IKKI daftarda yashaydi: `counterparty_balances` (POS cheki yozadi) va
-- `debts` reyestri (undirish ro'yxati o'qiydi). Q2 chekdan reyestrga ham qator
-- ochadi (`balance_adopted = true` ⇒ balansga QAYTA yozmaydi). Bu migratsiya
-- shu qator uchun HUJJAT-MANBA bog'lamini qo'shadi:
--
--   1. IDEMPOTENTLIK — bitta chekdan ko'pi bilan bitta qator (unique indeks);
--   2. SIMMETRIYA MANZILI — Q3 `refund()`/`edit()` qatorni source_doc_id
--      bo'yicha topadi va balans deltasiga TENG harakatlantiradi;
--   3. MANBA KO'RSATISH — Q4 undirish ekranidagi «bu qarz qayerdan keldi» va
--      Q5 backfill'ining «allaqachon qatori bor» filtri.
--
-- ⚠️ NULL SEMANTIKASI: Postgres unique indeksi nullable ustunlarda NULL larni
-- TAKRORLANUVCHI sanamaydi (`NULL != NULL`). Mavjud qatorlarning hammasi
-- (`NULL, NULL`) bir-biriga to'sqinlik qilmaydi va kelajakda qo'lda ochiladigan
-- `QRZ-` qarzlar ham cheklanmaydi — backfill KERAK EMAS. Bu xulq
-- `debt-source-doc-schema.test.ts` da yozma tasdiqlangan.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lishi SHART.

ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "source_doc_type" VARCHAR(32);
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "source_doc_id" UUID;

-- Indeks nomi Prisma `@@unique([accountId, sourceDocType, sourceDocId])` uchun
-- generatsiya qiladigan nom bilan AYNAN bir xil — aks holda keyingi
-- `migrate diff` uni «drift» deb ko'rib qayta yaratardi.
CREATE UNIQUE INDEX IF NOT EXISTS "debts_account_id_source_doc_type_source_doc_id_key"
  ON "debts"("account_id", "source_doc_type", "source_doc_id");
