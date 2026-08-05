-- Kassadan pul chiqishini TASNIFLASH: xarajat (RKO) va inkassatsiya.
-- Alohida jadval ochilmadi: smena yakunidagi «kutilgan naqd» aynan shu
-- jadvalni yig'adi, yangi jadvalni formulaga qo'shishni unutish mumkin.
ALTER TABLE "retail_drawer_cash_out" ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'other';
ALTER TABLE "retail_drawer_cash_out" ADD COLUMN "expense_item_id" UUID;
ALTER TABLE "retail_drawer_cash_out" ADD COLUMN "recipient_id" UUID;

CREATE INDEX "retail_drawer_cash_out_account_shift_kind_idx"
  ON "retail_drawer_cash_out"("account_id", "retail_shift_id", "kind");

-- Restrict: ishlatilgan modda o'chirilsa hujjat «moddasiz» qolardi.
ALTER TABLE "retail_drawer_cash_out"
  ADD CONSTRAINT "retail_drawer_cash_out_expense_item_id_fkey"
  FOREIGN KEY ("expense_item_id") REFERENCES "expense_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "retail_drawer_cash_out"
  ADD CONSTRAINT "retail_drawer_cash_out_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
