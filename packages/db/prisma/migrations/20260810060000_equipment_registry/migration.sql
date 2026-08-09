-- MK05 (menejer TZ 4M §6.4 / §6.3) — JIHOZ REYESTRI.
--
-- Ilgari tizim jihoz haqida hech narsa bilmasdi:
--   • javobgarlik taxtasida jihoz bloki ATAYLAB yo'q edi («0 ta jihoz» yo'q
--     ma'lumotga ishontirardi);
--   • bo'shatish ro'yxatidagi «Jihoz topshirilgan» bandi QO'LDA tasdiq edi.
-- Reyestr ikkalasini ham tizim biladigan faktga o'tkazadi.
--
-- YANGI ikki jadval, mavjudlariga TEGILMAYDI ⇒ prod-safe, backfill YO'Q:
-- biriktirish qatori bo'lmagan xodimda «qaytarilmagan jihoz yo'q» — bu
-- O'LCHANGAN javob (reyestr bo'sh), taxmin emas.

CREATE TABLE IF NOT EXISTS "equipment" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "inventory_no" TEXT,
    "category" VARCHAR(32),
    "status" VARCHAR(16) NOT NULL DEFAULT 'in_stock',
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- Inventar raqami akkaunt ichida takrorlanmaydi. NULL qiymatlar Postgres'da
-- takroriy deb SANALMAYDI — raqamsiz jihozlar bir-biriga xalaqit bermaydi.
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_account_id_inventory_no_key"
    ON "equipment"("account_id", "inventory_no");

-- Reyestr ro'yxati: holat bo'yicha filtr + nom bo'yicha tartib.
CREATE INDEX IF NOT EXISTS "equipment_account_id_status_name_idx"
    ON "equipment"("account_id", "status", "name");

CREATE TABLE IF NOT EXISTS "equipment_assignments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_id" UUID,
    "issue_note" TEXT,
    "returned_at" TIMESTAMPTZ,
    "returned_by_id" UUID,
    "return_condition" VARCHAR(16),
    "return_note" TEXT,

    CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id")
);

-- 🔴 ASOSIY QULF: bitta jihozda bir vaqtda BITTA ochiq biriktirish.
-- Ikkita ochiq qator = «kimda» savoliga ikki javob; javobgarlik ikkiga
-- bo'linsa, hech kim javobgar bo'lmay qoladi. Qisman indeks Prisma
-- sxemasida ifodalanmaydi — u faqat SHU YERDA yashaydi.
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_assignments_open_unique"
    ON "equipment_assignments"("equipment_id")
    WHERE "returned_at" IS NULL;

-- «Kimda nima qolgan»: xodim bo'yicha ochiq qatorlar (javobgarlik taxtasi,
-- bo'shatish ro'yxati). Ustunlar tartibi so'rov shakliga mos
-- (WHERE account_id = $1 AND employee_id = $2 AND returned_at IS NULL).
CREATE INDEX IF NOT EXISTS "equipment_assignments_account_id_employee_id_returned_at_idx"
    ON "equipment_assignments"("account_id", "employee_id", "returned_at");

-- Jihoz kartasidagi tarix — eng yangisi birinchi.
CREATE INDEX IF NOT EXISTS "equipment_assignments_equipment_id_issued_at_idx"
    ON "equipment_assignments"("equipment_id", "issued_at" DESC);

DO $$
BEGIN
    ALTER TABLE "equipment"
        ADD CONSTRAINT "equipment_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "equipment_assignments"
        ADD CONSTRAINT "equipment_assignments_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "equipment_assignments"
        ADD CONSTRAINT "equipment_assignments_equipment_id_fkey"
        FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "equipment_assignments"
        ADD CONSTRAINT "equipment_assignments_employee_id_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "equipment_assignments"
        ADD CONSTRAINT "equipment_assignments_issued_by_id_fkey"
        FOREIGN KEY ("issued_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "equipment_assignments"
        ADD CONSTRAINT "equipment_assignments_returned_by_id_fkey"
        FOREIGN KEY ("returned_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
