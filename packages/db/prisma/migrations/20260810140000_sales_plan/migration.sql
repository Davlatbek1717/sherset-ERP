-- MK37 / 2-bo'lim TZ §4.8 + 4-bo'lim TZ §6 — SOTUV REJASI (xodim × oy × plan turi).
--
-- Bitta jadval: `sales_plans` — FAQAT REJA.
--
-- FAKT USTUNI ATAYLAB YO'Q. Fakt `employee_daily_kpi_metrics` dan o'qiladi
-- (kunlik KPI dvigatelining yagona ombori). Fakt shu yerga nusxalansa, kun
-- qayta hisoblanganda yoki menejer tuzatma kiritganda reja yonidagi raqam
-- jimgina eskirardi — `expense_budgets` da aynan shu sabab bilan ham fakt
-- ustuni ochilmagan.
--
-- REJA YO'QLIGI = QATOR YO'QLIGI. `target_value = 0` bilan almashtirilmaydi:
-- «reja qo'yilmagan» bajarish foizini hisoblatmaydi, «reja nol» esa har
-- qanday sotuvni «cheksiz bajarildi» qilib ko'rsatardi.
--
-- UCHINCHI PLAN MODELI EMAS: `KpiTarget` (kunlik/haftalik, ko'rsatkich
-- kesimida) va `hr_salary_config.monthly_sales_target_minor` (oy kesimisiz
-- DOIMIY qiymat) bilan to'qnashmaydi — bu jadval OYGA bog'langan va
-- TURLANGAN rejani saqlaydi, ustuvorlik esa kodda bitta joyda hal qilinadi
-- (`sales-plan-target.ts`).
--
-- BACKFILL YO'Q — yangi ombor, tarixiy reja mavjud emas. Birinchi oy ekranda
-- «reja qo'yilmagan» bo'lib ko'rinadi (0% ham, 100% ham emas).

CREATE TABLE "sales_plans" (
  "id"            UUID        NOT NULL,
  "account_id"    UUID        NOT NULL,
  "employee_id"   UUID        NOT NULL,
  "year_month"    VARCHAR(7)  NOT NULL,
  "plan_type"     VARCHAR(20) NOT NULL,
  "target_value"  BIGINT      NOT NULL,
  "currency"      VARCHAR(3),
  "note"          TEXT,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_plans_pkey" PRIMARY KEY ("id"),

  -- Manfiy reja ma'nosiz: «−5 000 000 so'm tushum» bajarish foizini
  -- teskarisiga ag'darardi.
  CONSTRAINT "sales_plans_target_nonnegative" CHECK ("target_value" >= 0),

  -- Oy YORLIG'I qat'iy "YYYY-MM" (`expense_budgets` bilan bir xil).
  CONSTRAINT "sales_plans_year_month_format"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

  -- Yopiq lug'at. Notanish tur qabul qilinsa, reja saqlanardi-yu unga hech
  -- qachon fakt kelmasdi — ekranda abadiy «o'lchanmagan» qator qolardi.
  CONSTRAINT "sales_plans_plan_type_known"
    CHECK ("plan_type" IN ('revenue', 'profit', 'customer_count', 'collected_debt')),

  -- 🔴 BIRLIK LUG'ATLARI ARALASHMASIN: valyuta FAQAT pul turida bo'ladi va
  -- pul turida MAJBURIY. «5 ta mijoz UZS da» yozuvi keyin kimdir tomonidan
  -- konvertatsiya qilinishga urinilardi; valyutasiz pul rejasi esa boshqa
  -- valyutadagi fakt bilan jimgina solishtirilardi.
  CONSTRAINT "sales_plans_currency_matches_unit" CHECK (
    ("plan_type" IN ('revenue', 'profit', 'collected_debt') AND "currency" IS NOT NULL)
    OR ("plan_type" = 'customer_count' AND "currency" IS NULL)
  )
);

-- Bir xodim + bir oy + bir tur = BITTA reja (upsert kaliti).
CREATE UNIQUE INDEX "sales_plans_account_id_employee_id_year_month_plan_type_key"
  ON "sales_plans"("account_id", "employee_id", "year_month", "plan_type");

-- Ekranning asosiy so'rovi: «shu oyning barcha rejalari» (xodimlar jadvali).
CREATE INDEX "sales_plans_account_id_year_month_idx"
  ON "sales_plans"("account_id", "year_month");

ALTER TABLE "sales_plans"
  ADD CONSTRAINT "sales_plans_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: rejasi bor xodim o'chirilsa reja «egasiz» qolardi va oy yakunida
-- «kimning rejasi edi?» degan savolga javob bo'lmasdi.
ALTER TABLE "sales_plans"
  ADD CONSTRAINT "sales_plans_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL: rejani qo'ygan xodim ketsa reja qoladi (u korxonaning qarori),
-- faqat mualliflik izi yo'qoladi.
ALTER TABLE "sales_plans"
  ADD CONSTRAINT "sales_plans_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales_plans"
  ADD CONSTRAINT "sales_plans_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
