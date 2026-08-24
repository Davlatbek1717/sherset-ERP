-- G1 — vozvrat pulini kassadan qaytarish: RetailDrawerCashOut'ga vozvrat bog'i.
--
-- `sales_return_id` = to'lov QAYSI SalesReturn uchun (`kind='return_payout'`
-- hujjatlarida majburiy — servis tekshiradi). ON DELETE RESTRICT: to'lov
-- hujjati pul izining o'zi, to'langan vozvratni o'chirish izni yetim
-- qoldirardi.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lib qolishi shart.

ALTER TABLE "retail_drawer_cash_out" ADD COLUMN IF NOT EXISTS "sales_return_id" UUID;

DO $$ BEGIN
  ALTER TABLE "retail_drawer_cash_out"
    ADD CONSTRAINT "retail_drawer_cash_out_sales_return_id_fkey"
    FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "retail_drawer_cash_out_account_id_sales_return_id_idx"
  ON "retail_drawer_cash_out"("account_id", "sales_return_id");
