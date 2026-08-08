-- Faza 9 (audit DUP-15 / M-07) — kontragent balansining append-only JURNALI.
--
-- Muammo: materiallashgan `counterparty_balances`da organizatsiya o'lchovi yo'q
-- va har delta uchun yozuv saqlanmaydi. Shu sababli «Balans po organizatsiyam»
-- (counterparty.metrics), akt-sverka (report/counterparty-act), statement va
-- recompute-skript balansni har biri O'Z (chala) hujjat-ro'yxatidan mustaqil
-- rekonstruksiya qilardi — yangi yozuvchi qo'shilganda kamida bittasi unutilib
-- sonlar bir-biridan ajralardi (2026-08-05 debt-issue va POS qarz-sotuvida
-- aynan shu bo'ldi).
--
-- Yechim: `CounterpartyBalanceService.applyDelta` har chaqirilganda
-- materiallashgan upsert BILAN BIR TRANZAKSIYADA shu jadvalga bitta qator
-- yozadi. Invariant: SUM(delta_minor) per (counterparty_id, currency) ==
-- counterparty_balances.balance_minor.
--
-- Qatorlar o'zgartirilmaydi/o'chirilmaydi (unpost/cancel teskari belgili YANGI
-- qator yozadi), shuning uchun `updated_at` yo'q.
--
-- `organization_id` NULLABLE: `Debt` (QRZ- qarz) modelida organizatsiya
-- o'lchovi umuman yo'q, `retail_sales.organization_id` esa optional. NULL =
-- «organizatsiyaga taqsimlanmagan delta».
--
-- BACKFILL YO'Q: jadval bo'sh boshlanadi, unga faqat migratsiyadan KEYINGI
-- deltalar tushadi. Mavjud balanslarni jurnalga ko'chirish — alohida ops-qadam
-- (rejadagi Faza 10 hisobotida hal qilinadi), chunki tarixiy hujjatlardan
-- qayta qurish DUP-02 dagi «qamralmagan manba» xatarini takrorlaydi.
CREATE TABLE "counterparty_balance_entries" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "organization_id" UUID,
    "currency" VARCHAR(3) NOT NULL,
    "delta_minor" BIGINT NOT NULL,
    "doc_type" VARCHAR(40) NOT NULL,
    "doc_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counterparty_balance_entries_pkey" PRIMARY KEY ("id")
);

-- Asosiy o'qish naqshi: kontragent×valyuta bo'yicha davr kesimi
-- (statement/akt running-balance, opening/closing).
CREATE INDEX "counterparty_balance_entries_account_id_counterparty_id_cur_idx"
  ON "counterparty_balance_entries" ("account_id", "counterparty_id", "currency", "created_at");

-- «Balans po organizatsiyam» — org bo'yicha groupBy.
CREATE INDEX "counterparty_balance_entries_account_id_organization_id_cur_idx"
  ON "counterparty_balance_entries" ("account_id", "organization_id", "currency");

-- Hujjat bo'yicha teskari qidiruv (unpost/cancel juftini topish, audit-trail).
CREATE INDEX "counterparty_balance_entries_account_id_doc_type_doc_id_idx"
  ON "counterparty_balance_entries" ("account_id", "doc_type", "doc_id");

ALTER TABLE "counterparty_balance_entries"
  ADD CONSTRAINT "counterparty_balance_entries_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "counterparty_balance_entries"
  ADD CONSTRAINT "counterparty_balance_entries_counterparty_id_fkey"
  FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "counterparty_balance_entries"
  ADD CONSTRAINT "counterparty_balance_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
