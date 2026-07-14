-- «MUAMMOLI QARZDORLAR» (2026-07-14 talab).
--
-- Operator qo'ng'iroq natijasini belgilaganda mijozni «muammoli» deb ajratib
-- qo'yadi (sabab + qachon qayta qo'ng'iroq qilish). Shundan keyin u alohida
-- «Muammoli qarzdorlar» bo'limchasida ko'rinadi.
--
-- Additive: mavjud qarzlar problem=false bo'lib qoladi, hech narsa o'zgarmaydi.

ALTER TABLE "debts"
  ADD COLUMN "problem"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "problem_reason" TEXT,
  ADD COLUMN "problem_at"     TIMESTAMPTZ,
  ADD COLUMN "problem_by_id"  UUID;

-- «Muammoli qarzdorlar» ro'yxati shu indeks bilan tez ochiladi.
CREATE INDEX "debts_account_id_problem_idx"
  ON "debts" ("account_id", "problem")
  WHERE "problem" = true;
