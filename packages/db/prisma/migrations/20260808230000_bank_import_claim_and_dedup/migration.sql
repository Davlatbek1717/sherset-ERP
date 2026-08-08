-- Faza 20 (audit INT-05) — bank-import commit-poygasi + vypiska-dedup
--
-- 1) bank_statement_rows.commit_claimed_at — commit() to'lov yaratishdan OLDIN
--    oladigan atomik «claim» belgisi. Ikki parallel commit (double-click) endi
--    bitta qatordan IKKITA PaymentIn/PaymentOut yarata olmaydi.
-- 2) bank_statements.content_hash — yuklangan fayl mazmunining sha256'i; bir
--    xil vypiskani qayta yuklaganda upload javobida ogohlantirish uchun.
-- 3) Ikki indeks — hash bo'yicha qidiruv va «bu bank tranzaksiyasi allaqachon
--    import qilinganmi» dedup-qidiruvi uchun.

ALTER TABLE "bank_statement_rows" ADD COLUMN IF NOT EXISTS "commit_claimed_at" TIMESTAMPTZ;

ALTER TABLE "bank_statements" ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "bank_statements_account_id_content_hash_idx"
  ON "bank_statements" ("account_id", "content_hash");

CREATE INDEX IF NOT EXISTS "bank_statement_rows_dedup_idx"
  ON "bank_statement_rows" ("account_id", "direction", "moment", "amount_minor");
