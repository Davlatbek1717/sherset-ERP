-- Faza 10 — «opening snapshot» backfill uchun `doc_id` NULLABLE bo'ladi.
--
-- Jurnal (`counterparty_balance_entries`) Faza 9 da BO'SH boshlandi, materiallashgan
-- `counterparty_balances` da esa butun tarix bor. O'quvchilar (metrics byOrg, akt-sverka,
-- statement, recompute) jurnalga ko'chirilishi uchun tarixiy qoldiq jurnalga kirishi kerak.
-- Tanlangan usul — hujjat-replay EMAS (u DUP-02 xatarini takrorlaydi), balki har mavjud
-- balans qatori uchun BITTA `doc_type = 'opening'` qatori. Bunday qatorning hujjati yo'q,
-- shuning uchun `doc_id` NULL bo'lishi SHART.
--
-- Yozuvchi tomoni o'zgarmaydi: `ApplyDeltaMeta.docId` hamon `string` (majburiy), ya'ni
-- haqiqiy hujjat deltasi hech qachon NULL docId bilan tusha olmaydi — buni tip tizimi
-- ushlab turadi, DB cheklovi emas.
ALTER TABLE "counterparty_balance_entries" ALTER COLUMN "doc_id" DROP NOT NULL;

-- Backfill qatorlarini davr kesimidan tashqarida topish/qayta ishlash uchun (skript
-- idempotent bo'lishi kerak: ikkinchi yugurtirishda mavjud opening qatorlarini ko'rsin).
CREATE INDEX IF NOT EXISTS "counterparty_balance_entries_account_doctype_created_idx"
  ON "counterparty_balance_entries" ("account_id", "doc_type", "created_at");
