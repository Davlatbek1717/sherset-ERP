-- Kunlik KPI qabul qilish — IKKI IMPLEMENTATSIYANING BIRLASHTIRILISHI (4M.2).
--
-- KONTEKST (nega bu migratsiya bor): 4M.2 qabul oqimi ikki marta, mustaqil
-- qurilgan — `wave4m-accept` branchida (2026-08-02, merge qilinmagan) va
-- `climart-adoption` da (2026-08-04, `20260804120000`). Egasi ikkalasini
-- BIRLASHTIRISHNI tanladi. Yakuniy shakl `wave4m-accept` niki (u
-- `SupplyApprovalEvent` nomlash konventsiyasiga mos: `comment`/`detail`),
-- ustiga `climart-adoption` ning muzlatilgan kompozit balli qo'shiladi.
--
-- Migratsiya UCH xil boshlang'ich holatda ishlashi kerak, shuning uchun har
-- qadam IDEMPOTENT:
--   (a) toza baza — `20260804120000` qo'llangan (note/payload shakli);
--   (b) lokal dev — `wave4m-accept` `db push` qilgan (comment/detail shakli);
--   (c) prod — hech biri qo'llanmagan; `20260804120000` avval yuguradi.
--
-- Qaytarish: ustunlarni teskari nomga qaytarish + score_* DROP.

-- ── employee_daily_kpi ──────────────────────────────────────────────────────

-- Eskalatsiya soati: holat OXIRGI marta qachon o'zgardi. `updated_at` yaramaydi —
-- u tungi qayta hisoblashda ham siljiydi va javobsiz kun hech qachon egaga chiqmaydi.
ALTER TABLE "employee_daily_kpi" ADD COLUMN IF NOT EXISTS "state_changed_at" TIMESTAMPTZ;

-- Qabul lahzasida MUZLATILADIGAN kompozit ball va uning qamrovi.
ALTER TABLE "employee_daily_kpi" ADD COLUMN IF NOT EXISTS "score_percent" DECIMAL(7,2);
ALTER TABLE "employee_daily_kpi" ADD COLUMN IF NOT EXISTS "score_coverage" DECIMAL(5,4);

-- `queued_at` (A varianti) → `state_changed_at` (B varianti). Ma'lumot
-- ko'chiriladi, keyin ustun olib tashlanadi — ikki nom bir ma'noni bildirmasin.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_daily_kpi' AND column_name = 'queued_at'
  ) THEN
    UPDATE "employee_daily_kpi" SET "state_changed_at" = COALESCE("state_changed_at", "queued_at");
    ALTER TABLE "employee_daily_kpi" DROP COLUMN "queued_at";
  END IF;
END $$;

-- Navbatda turgan, lekin hech qachon holat-vaqti yozilmagan kunlar bo'lsa —
-- ular eskalatsiya skaniga tushmay qolardi. Mavjud qatorlarni to'ldiramiz.
UPDATE "employee_daily_kpi"
SET "state_changed_at" = COALESCE("state_changed_at", "computed_at")
WHERE "state_changed_at" IS NULL;

CREATE INDEX IF NOT EXISTS "employee_daily_kpi_account_id_state_state_changed_at_idx"
  ON "employee_daily_kpi"("account_id", "state", "state_changed_at");

-- ── employee_daily_kpi_events ───────────────────────────────────────────────

-- (c) holati: jadval umuman bo'lmasa yaratamiz (yakuniy shaklda).
CREATE TABLE IF NOT EXISTS "employee_daily_kpi_events" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "daily_kpi_id" UUID NOT NULL,
    "from_state" VARCHAR(20) NOT NULL,
    "to_state" VARCHAR(20) NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" UUID,
    "reason_code" VARCHAR(40),
    "comment" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_daily_kpi_events_pkey" PRIMARY KEY ("id")
);

-- (a) holati: `note`/`payload` → `comment`/`detail`. RENAME, DROP+ADD emas —
-- allaqachon yozilgan jurnal yozuvlari APPEND-ONLY, ular yo'qolmasligi kerak.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_daily_kpi_events' AND column_name = 'note'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_daily_kpi_events' AND column_name = 'comment'
  ) THEN
    ALTER TABLE "employee_daily_kpi_events" RENAME COLUMN "note" TO "comment";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_daily_kpi_events' AND column_name = 'payload'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_daily_kpi_events' AND column_name = 'detail'
  ) THEN
    ALTER TABLE "employee_daily_kpi_events" RENAME COLUMN "payload" TO "detail";
  END IF;
END $$;

-- Ustunlar bo'lmasa qo'shamiz (aralash holatlar uchun himoya).
ALTER TABLE "employee_daily_kpi_events" ADD COLUMN IF NOT EXISTS "comment" TEXT;
ALTER TABLE "employee_daily_kpi_events" ADD COLUMN IF NOT EXISTS "detail" JSONB;

-- Turlarni yakuniy shaklga keltirish (VARCHAR(1000) → TEXT va h.k.).
ALTER TABLE "employee_daily_kpi_events" ALTER COLUMN "comment" TYPE TEXT;
ALTER TABLE "employee_daily_kpi_events" ALTER COLUMN "action" TYPE VARCHAR(30);
ALTER TABLE "employee_daily_kpi_events" ALTER COLUMN "actor_type" TYPE VARCHAR(20);

-- Indekslar: eskisi (A) olib tashlanadi, yakuniy uchtasi qo'yiladi.
DROP INDEX IF EXISTS "employee_daily_kpi_events_daily_kpi_id_created_at_idx";
DROP INDEX IF EXISTS "employee_daily_kpi_events_account_id_created_at_action_idx";

CREATE INDEX IF NOT EXISTS "employee_daily_kpi_events_account_id_daily_kpi_id_created_at_idx"
  ON "employee_daily_kpi_events"("account_id", "daily_kpi_id", "created_at");
CREATE INDEX IF NOT EXISTS "employee_daily_kpi_events_account_id_created_at_idx"
  ON "employee_daily_kpi_events"("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "employee_daily_kpi_events_account_id_action_created_at_idx"
  ON "employee_daily_kpi_events"("account_id", "action", "created_at" DESC);

-- FK'lar — mavjud bo'lmasa qo'shiladi.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_daily_kpi_events_account_id_fkey'
  ) THEN
    ALTER TABLE "employee_daily_kpi_events"
      ADD CONSTRAINT "employee_daily_kpi_events_account_id_fkey"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_daily_kpi_events_daily_kpi_id_fkey'
  ) THEN
    ALTER TABLE "employee_daily_kpi_events"
      ADD CONSTRAINT "employee_daily_kpi_events_daily_kpi_id_fkey"
      FOREIGN KEY ("daily_kpi_id") REFERENCES "employee_daily_kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
