-- F001 — «Filial» (Branch) o'qini bazaga kiritish.
-- TZ: docs/superpowers/specs/2026-08-02-kop-filiallilik-tz-design.md §2.3, §8.1
--
-- Bu migratsiya FAQAT QO'SHADI: yangi "branches" jadvali + har akkaunt uchun
-- bitta «Asosiy» filial. Hech bir mavjud jadval tegilmaydi — bir filialli
-- foydalanuvchi hech qanday farqni sezmasligi kerak (regressiya qulfi,
-- `apps/api/src/modules/branch/branch-migration.test.ts` buni qulflaydi).
--
-- Tashqi kalitlar CREATE TABLE ichida (inline REFERENCES) yozilgan — shu tufayli
-- faylda mavjud jadvalga tegadigan bironta amal umuman yo'q.

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "organization_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "address" TEXT,
    "phone" VARCHAR(20),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "branches_account_id_fkey" FOREIGN KEY ("account_id")
        REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Prisma `@@unique([accountId, code])` — `code` NULL bo'lsa Postgres NULL'larni
-- turlicha sanaydi, ya'ni kodsiz filiallar bir-biriga xalaqit bermaydi.
CREATE UNIQUE INDEX "branches_account_id_code_key" ON "branches"("account_id", "code");

CREATE INDEX "branches_account_id_archived_idx" ON "branches"("account_id", "archived");

-- INVARIANT (TZ §8.1): akkauntda AYNAN BITTA standart filial.
-- Prisma sxemasi qisman-unikal indeksni ifodalay olmaydi, shuning uchun
-- invariant FAQAT shu yerda yashaydi. Servis qatlamidagi tekshiruv
-- (`BranchService.create/update/setDefault`) undan oldin ishlaydi; bu indeks
-- esa poyga (race) holatida oxirgi to'siq.
CREATE UNIQUE INDEX "branches_account_id_is_default_key"
    ON "branches"("account_id") WHERE "is_default";

-- §8.1 1-qadam: har akkauntga bitta «Asosiy» filial.
-- `organization_id` = akkauntning eng eski arxivlanmagan tashkiloti (bugun
-- hammasida bitta STIR); topilmasa NULL qoladi — hech narsa buzilmaydi.
-- IDEMPOTENT: filiali bor akkaunt chetlab o'tiladi (NOT EXISTS) va qisman-unikal
-- indeks bilan to'qnashuv jimgina o'tkazib yuboriladi (ON CONFLICT DO NOTHING),
-- ya'ni faylni qayta yugurtirish ikkinchi filial yaratmaydi.
INSERT INTO "branches" (
    "id", "account_id", "organization_id", "name",
    "is_default", "archived", "sort_order", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    a."id",
    (
        SELECT o."id" FROM "organizations" o
        WHERE o."account_id" = a."id" AND o."archived" = false
        ORDER BY o."created_at" ASC
        LIMIT 1
    ),
    'Asosiy',
    true,
    false,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "accounts" a
WHERE NOT EXISTS (
    SELECT 1 FROM "branches" b WHERE b."account_id" = a."id"
)
ON CONFLICT DO NOTHING;
