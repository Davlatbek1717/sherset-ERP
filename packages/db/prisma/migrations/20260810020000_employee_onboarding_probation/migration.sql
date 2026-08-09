-- MK02 (menejer TZ 4M.4 / §6.3) — ishga qabul tomoni: sinov muddati.
--
-- `employee_offboardings` ning ko'zgusi. U yerda ro'yxat tugamaguncha xodim
-- ARXIVLANMAYDI; bu yerda ro'yxat tugamaguncha sinov «o'tdi» deb yopilmaydi.
-- Ikkalasida ham tizim biladigan band (`auto`) qo'lda belgilanmaydi.
--
-- YANGI jadval, mavjud jadvallarga TEGILMAYDI ⇒ prod-safe, backfill YO'Q:
-- onboarding qatori bo'lmagan xodim «sinovda emas» (`active`) deb qaraladi.

CREATE TABLE IF NOT EXISTS "employee_onboardings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "probation_starts_on" DATE,
    "probation_ends_on" DATE,
    "evaluation_on" DATE,
    "outcome" VARCHAR(10),
    "outcome_at" TIMESTAMPTZ,
    "outcome_by_id" UUID,
    "outcome_note" TEXT,
    "items" JSONB NOT NULL DEFAULT '{}',
    "started_by_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_onboardings_pkey" PRIMARY KEY ("id")
);

-- Bir xodimda bir vaqtda BITTA sinov jarayoni (offboarding bilan bir xil qoida).
CREATE UNIQUE INDEX IF NOT EXISTS "employee_onboardings_employee_id_key"
    ON "employee_onboardings"("employee_id");

-- Menejer ekrani: «sinovda turganlar» — avval yopilmagan qatorlar (`outcome IS NULL`),
-- keyin baholash sanasi bo'yicha tartib. Ustunlar tartibi so'rov shakliga mos
-- (WHERE account_id = $1 AND outcome IS NULL ORDER BY evaluation_on).
CREATE INDEX IF NOT EXISTS "employee_onboardings_account_id_outcome_evaluation_on_idx"
    ON "employee_onboardings"("account_id", "outcome", "evaluation_on");

DO $$
BEGIN
    ALTER TABLE "employee_onboardings"
        ADD CONSTRAINT "employee_onboardings_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "employee_onboardings"
        ADD CONSTRAINT "employee_onboardings_employee_id_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "employee_onboardings"
        ADD CONSTRAINT "employee_onboardings_started_by_id_fkey"
        FOREIGN KEY ("started_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "employee_onboardings"
        ADD CONSTRAINT "employee_onboardings_outcome_by_id_fkey"
        FOREIGN KEY ("outcome_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
