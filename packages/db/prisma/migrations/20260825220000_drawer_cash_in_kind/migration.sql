-- A1 (2026-08-25) — «Mijozlar bizga oldindan pul berib qo'yishadi, keyin tovar
-- olishadi — shu mijozlar bilan ishlay olmayapmiz» (egasi).
-- Reja: docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md (§1.3, A1).
--
-- Kassada mijozdan AVANS qabul qilish yo'li ochiladi. Pul yashiqqa jismonan
-- tushadi, ya'ni hujjat AYNAN `retail_drawer_cash_in` da turishi SHART: smena
-- yakunidagi «kutilgan naqd» (§8.4) shu jadvalni yig'adi
-- (`collectCashInputs.drawerInMinor`). Alohida jadval ochilsa uni formulaga
-- qo'shishni unutish mumkin edi — §100 bug'ining aynan takrori.
--
-- Shuning uchun bitta yangi ustun — TASNIF:
--   'topup'           — «Внесение» (kassirning o'z kirimi, kontragentsiz);
--   'customer_prepay' — mijoz avansi (`agent_id` MAJBURIY, o'sha
--                       tranzaksiyada kontragent balansiga `−sum_minor`);
--   'other'           — tasniflanmagan (MAVJUD yozuvlar shu qiymatda qoladi).
--
-- ⚠️ DEFAULT ATAYLAB 'other', 'topup' EMAS: mavjud qatorlar «Внесение» deb
-- qayta yorliqlanmaydi. Ular haqiqatan tasnifsiz yozilgan va ularni
-- retroaktiv tasniflash — o'lchanmagan da'vo (`retail_drawer_cash_out.kind`
-- bilan aynan bir xil qaror).
--
-- PULGA TA'SIRI YO'Q: ustun qo'shiladi, birorta ham `UPDATE`/`DELETE` yo'q,
-- `sum_minor` ga tegilmaydi. Kutilgan naqd formulasi `kind` ni UMUMAN
-- o'qimaydi (u butun jadvalni yig'adi) — ya'ni bu migratsiyadan keyin
-- smena hisobi BIR TIYIN ham o'zgarmaydi.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lishi SHART.

ALTER TABLE "retail_drawer_cash_in"
  ADD COLUMN IF NOT EXISTS "kind" VARCHAR(20) NOT NULL DEFAULT 'other';

-- Indeks nomlari Prisma `@@index([...])` uchun generatsiya qiladigan nomlar
-- bilan AYNAN bir xil — aks holda keyingi `migrate diff` ularni «drift» deb
-- ko'rib qayta yaratardi.
CREATE INDEX IF NOT EXISTS "retail_drawer_cash_in_account_id_retail_shift_id_kind_idx"
  ON "retail_drawer_cash_in"("account_id", "retail_shift_id", "kind");

CREATE INDEX IF NOT EXISTS "retail_drawer_cash_in_account_id_agent_id_kind_idx"
  ON "retail_drawer_cash_in"("account_id", "agent_id", "kind");
