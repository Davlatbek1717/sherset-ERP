-- MK12 / 4M TZ §8 — XARAJAT BYUDJETI (modda × oy, plan/fakt).
--
-- Bitta jadval: `expense_budgets` — FAQAT REJA.
--
-- FAKT USTUNI ATAYLAB YO'Q. Fakt mavjud xarajat hujjatlaridan o'qiladi
-- (`cash_out` · `payments_out` · `retail_drawer_cash_out` WHERE kind='expense').
-- Agar fakt shu yerga nusxalansa, hujjat tahrirlanganda yoki bekor
-- qilinganda byudjet jimgina eskirardi — bu repoda «yangi yozuvchi ochilsa
-- eski o'quvchi eskiradi» bug-klassi allaqachon bir necha marta bo'lgan.
--
-- REJA YO'QLIGI = QATOR YO'QLIGI. `planned_minor = 0` bilan almashtirilmaydi:
-- «reja qo'yilmagan» og'ishni hisoblatmaydi, «reja nol» esa hisoblatadi
-- (har qanday sarf = oshib ketish). Ikkalasi ikki xil javob.
--
-- BACKFILL YO'Q — bu yangi ombor, tarixiy reja mavjud emas. Birinchi oy
-- ekranda «reja qo'yilmagan» bo'lib ko'rinadi (100% ham, 0% ham emas).

CREATE TABLE "expense_budgets" (
  "id"              UUID        NOT NULL,
  "account_id"      UUID        NOT NULL,
  "expense_item_id" UUID        NOT NULL,
  "year_month"      VARCHAR(7)  NOT NULL,
  "planned_minor"   BIGINT      NOT NULL,
  "currency"        VARCHAR(3)  NOT NULL DEFAULT 'UZS',
  "note"            TEXT,
  "created_by_id"   UUID,
  "updated_by_id"   UUID,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "expense_budgets_pkey" PRIMARY KEY ("id"),
  -- Manfiy reja ma'nosiz: «−500 000 so'm ijara» og'ish formulasini
  -- teskarisiga ag'darardi va status yolg'on chiqardi.
  CONSTRAINT "expense_budgets_planned_nonnegative" CHECK ("planned_minor" >= 0),
  -- Oy YORLIG'I qat'iy "YYYY-MM". Erkin matn kirsa (masalan "2026-8" yoki
  -- "avgust") qator hech qachon topilmaydigan bo'lib qolardi — ekran esa
  -- «reja qo'yilmagan» derdi, ya'ni xato JIM bo'lardi.
  CONSTRAINT "expense_budgets_year_month_format" CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

-- Bir modda + bir oy = BITTA reja.
CREATE UNIQUE INDEX "expense_budgets_account_id_expense_item_id_year_month_key"
  ON "expense_budgets"("account_id", "expense_item_id", "year_month");

-- Ekranning asosiy so'rovi: «shu oyning barcha rejalari».
CREATE INDEX "expense_budgets_account_id_year_month_idx"
  ON "expense_budgets"("account_id", "year_month");

ALTER TABLE "expense_budgets"
  ADD CONSTRAINT "expense_budgets_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: rejasi bor modda o'chirilsa byudjet «moddasiz» qolardi.
ALTER TABLE "expense_budgets"
  ADD CONSTRAINT "expense_budgets_expense_item_id_fkey"
  FOREIGN KEY ("expense_item_id") REFERENCES "expense_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_budgets"
  ADD CONSTRAINT "expense_budgets_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_budgets"
  ADD CONSTRAINT "expense_budgets_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
