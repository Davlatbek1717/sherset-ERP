-- 15-KUNLIK MIJOZGA TAKROR TELEGRAM ESLATMASI (2026-07-16 talab).
--
-- Qarz qolgan (status unpaid/partial) mijozga har N kunda (default 15) avtomatik
-- «qarzingiz bor» eslatmasi ketadi. Bu — operatorning qo'ng'iroq jadvalidan
-- (next_contact_at / call_reminded_at) ALOHIDA dedup o'qi: shu maydon oxirgi
-- MIJOZGA-eslatma yuborilgan paytni saqlaydi.
--
-- Additive: mavjud qarzlarda last_tg_reminder_at = NULL (birinchi eslatma
-- created_at'dan N kun o'tgach hisoblanadi). Hech narsa buzilmaydi.

ALTER TABLE "debts"
  ADD COLUMN "last_tg_reminder_at" TIMESTAMPTZ;

-- Kunlik eslatma-cron faol qarzlarni shu qisman indeks bilan tez tanlaydi.
CREATE INDEX "debts_account_id_status_last_tg_reminder_at_idx"
  ON "debts" ("account_id", "status", "last_tg_reminder_at")
  WHERE "deleted_at" IS NULL AND "status" IN ('unpaid', 'partial');
