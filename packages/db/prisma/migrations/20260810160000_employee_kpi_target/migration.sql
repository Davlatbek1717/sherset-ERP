-- KPI-01 / 4M TZ §2.5, §9 — XODIMGA BIRIKTIRILGAN KPI MAQSADI («todo» qatlami).
--
-- Ikki jadval: `employee_kpi_targets` (mustaqil qator) + `employee_kpi_target_events`
-- (append-only jurnal).
--
-- NEGA: bugun bitta xodimga bitta KPI biriktirish TO'RT jadval (`kpi_metric_defs`
-- → `kpi_profiles` → `kpi_profile_versions` → `kpi_profile_metrics`) va og'irliklarni
-- 100% ga muvozanatlashni talab qiladi; saqlash YANGI VERSIYA yozadi. Bu qatlam
-- o'sha to'rtlikni O'CHIRMAYDI — ustiga yengil, mustaqil qator qo'yadi.
--
-- 🔴 VERSIYALANMAYDI. `kpi_profile_versions` ning maqsadi «o'tgan oyning raqami
-- o'zgarmasin» edi. Bu qatlam o'sha kafolatni versiyasiz oladi:
-- `employee_daily_kpi_metrics` o'sha kungi maqsad+faktni MUHRLAB saqlaydi
-- (tan-narx muzlatish klassi). Tahrir faqat KELAJAK kunlarga ta'sir qiladi.
-- Muhrlash ko'prigi — KPI-03 fazasi; bu migratsiya XULQNI O'ZGARTIRMAYDI
-- (dvigatel hali eski yo'ldan o'qiydi).
--
-- BIRLIK QATORDA (`unit`) — DENORMALLASHTIRILGAN va bu ATAYLAB: CHECK boshqa
-- jadvalni (`kpi_metric_defs.unit`) ko'ra olmaydi, ya'ni `money ↔ currency`
-- qoidasini birliksiz umuman yozib bo'lmaydi. Naqsh `sales_plans.plan_type`
-- bilan bir xil. `metric_key` ga FK ATAYLAB YO'Q: built-in metrikaning hisob
-- bo'yicha `kpi_metric_defs` qatori bo'lmasligi mumkin (katalogning asl manbai —
-- kod, `kpi-metrics.ts`) va FK ularni bloklardi.

-- CreateTable
CREATE TABLE "employee_kpi_targets" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "metric_key" VARCHAR(50) NOT NULL,
    "unit" VARCHAR(10) NOT NULL,
    "target_value" BIGINT,
    "period" VARCHAR(10) NOT NULL,
    "weight" DECIMAL(5,2),
    "currency" VARCHAR(3),
    "manual_done_at" TIMESTAMPTZ,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- DEFAULT ATAYLAB YO'Q: Prisma `@updatedAt` ni DB-default'siz generatsiya
    -- qiladi; default qo'shilsa `migrate diff` abadiy farq ko'rsatib turardi
    -- (`employee-username-unique-index` sabog'i — sxema va DB bir xil turishi).
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employee_kpi_targets_pkey" PRIMARY KEY ("id"),

    -- Yopiq birlik lug'ati (`kpi_metric_defs.unit` bilan bir xil to'plam).
    -- Notanish birlik kirsa `currency` qoidasi jimgina ishlamay qolardi.
    CONSTRAINT "employee_kpi_targets_unit_known"
      CHECK ("unit" IN ('money', 'count', 'percent', 'minutes')),

    -- TZ §2.5 davr lug'ati. `monthly` ham bor: haftalik/oylik qator kunlik
    -- ballga BO'LINMAYDI (bo'lish «shu haftada necha ish kuni» degan jim
    -- taxmonni talab qilardi) — u faqat o'z davri so'rovida qaytadi.
    CONSTRAINT "employee_kpi_targets_period_known"
      CHECK ("period" IN ('daily', 'weekly', 'monthly')),

    -- 🔴 BIRLIK LUG'ATLARI ARALASHMASIN: valyuta FAQAT pul birligida bo'ladi
    -- va pul birligida MAJBURIY. Bir tomoni tushib qolsa «5 ta mijoz UZS da»
    -- yoki valyutasiz pul maqsadi yoziladi va keyin boshqa valyutadagi fakt
    -- bilan JIMGINA solishtirilardi (metrika birligi ≠ chegara birligi
    -- bug-klassi, 100× xato).
    CONSTRAINT "employee_kpi_targets_currency_matches_unit" CHECK (
      ("unit" = 'money' AND "currency" IS NOT NULL)
      OR ("unit" <> 'money' AND "currency" IS NULL)
    ),

    -- Manfiy maqsad ma'nosiz — bajarish foizini teskarisiga ag'darardi.
    -- NULL esa RUXSAT: «raqamsiz KPI» (faqat bajarildi/bajarilmadi).
    CONSTRAINT "employee_kpi_targets_target_nonnegative"
      CHECK ("target_value" IS NULL OR "target_value" >= 0),

    -- Og'irlik 0…100 oralig'ida. NULL = ballash yo'lidan TASHQARIDA
    -- (0 dan farqli: 0 «ballandi va nolga arziydi» degani).
    CONSTRAINT "employee_kpi_targets_weight_range"
      CHECK ("weight" IS NULL OR ("weight" >= 0 AND "weight" <= 100))
);

-- CreateTable
CREATE TABLE "employee_kpi_target_events" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "target_id" UUID,
    "employee_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_kpi_target_events_pkey" PRIMARY KEY ("id"),

    -- Yopiq harakat lug'ati. Erkin matn kirsa jurnal bo'yicha hisobot
    -- («nechta maqsad o'chirildi») jimgina kam ko'rsatardi.
    CONSTRAINT "employee_kpi_target_events_action_known"
      CHECK ("action" IN ('created', 'updated', 'deleted', 'marked_done', 'reopened'))
);

-- CreateIndex
CREATE INDEX "employee_kpi_targets_account_id_employee_id_active_idx" ON "employee_kpi_targets"("account_id", "employee_id", "active");

-- CreateIndex
CREATE INDEX "employee_kpi_targets_account_id_metric_key_idx" ON "employee_kpi_targets"("account_id", "metric_key");

-- Bir xodim + bir metrika + bir davr = BITTA maqsad (upsert kaliti).
-- Takror qator bo'lsa «qaysi biri amalda» savoli javobsiz qolardi.
-- CreateIndex
CREATE UNIQUE INDEX "employee_kpi_targets_employee_id_metric_key_period_key" ON "employee_kpi_targets"("employee_id", "metric_key", "period");

-- CreateIndex
CREATE INDEX "employee_kpi_target_events_account_id_employee_id_created_a_idx" ON "employee_kpi_target_events"("account_id", "employee_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "employee_kpi_target_events_account_id_target_id_created_at_idx" ON "employee_kpi_target_events"("account_id", "target_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "employee_kpi_targets" ADD CONSTRAINT "employee_kpi_targets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_targets" ADD CONSTRAINT "employee_kpi_targets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_targets" ADD CONSTRAINT "employee_kpi_targets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_target_events" ADD CONSTRAINT "employee_kpi_target_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 🔴 SET NULL (Cascade EMAS): maqsad qatori o'chirilsa event QOLADI. Cascade
-- bo'lsa «kim qachon o'chirdi» savoliga javob ham o'sha lahzada yo'q bo'lardi —
-- shuning uchun payload HAVOLA emas, o'sha ondagi qiymatlar MATNI.
-- AddForeignKey
ALTER TABLE "employee_kpi_target_events" ADD CONSTRAINT "employee_kpi_target_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "employee_kpi_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_target_events" ADD CONSTRAINT "employee_kpi_target_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_target_events" ADD CONSTRAINT "employee_kpi_target_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- BACKFILL — mavjud profil maqsadlari yangi qatlamga KO'CHIRILADI.
--
-- Qamrov: FAQAT `employee_id` to'ldirilgan (ya'ni XODIMGA biriktirilgan)
-- profillar. Lavozim profillari ATAYLAB ko'chirilmaydi — ular xodimga emas,
-- ROLGA tegishli va KPI-03 resolveri uchun baza bo'lib qoladi. Ko'chirilsa har
-- xodimga «shaxsiy» nusxa paydo bo'lardi va lavozim maqsadini keyin
-- o'zgartirish hech kimga ta'sir qilmasdi.
--
-- Faqat ENG OXIRGI versiya (`DISTINCT ON` + `version DESC`): eski versiyalar
-- ham olinsa bir metrikaning bir necha maqsadi navbatma-navbat urinardi va
-- g'olib TASODIFIY bo'lardi.
--
-- `period = 'daily'` — `kpi_profile_metrics.target` ta'rifi bo'yicha KUNLIK.
-- `weight` AYNAN ko'chiriladi (0 ham) — bu faza xulqni o'zgartirmaydi;
-- og'irlikni ixtiyoriy qilish KPI-05 ning ishi.
--
-- Valyuta hisob valyutasidan (`accounts.currency`) va faqat `money` birlikda —
-- yuqoridagi CHECK aynan shuni talab qiladi.
--
-- IDEMPOTENT (`ON CONFLICT DO NOTHING`): blok qayta yugurtirilsa dublikat
-- yozilmaydi. DO UPDATE ATAYLAB EMAS — mavjud qatorni ustiga yozish menejer
-- tahririni JIMGINA bekor qilardi.
-- ===========================================================================

-- >>> BACKFILL BEGIN
INSERT INTO "employee_kpi_targets" (
  "id", "account_id", "employee_id", "metric_key", "unit",
  "target_value", "period", "weight", "currency", "active",
  "created_by_id", "created_at", "updated_at"
)
SELECT DISTINCT ON (src."employee_id", src."key")
  gen_random_uuid(),
  src."account_id",
  src."employee_id",
  src."key",
  src."unit",
  src."target",
  'daily',
  src."weight",
  CASE WHEN src."unit" = 'money' THEN src."account_currency" ELSE NULL END,
  TRUE,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    p."account_id",
    p."employee_id",
    d."key",
    d."unit",
    m."target",
    m."weight",
    a."currency" AS "account_currency",
    lv."version"
  FROM "kpi_profiles" p
  JOIN "accounts" a ON a."id" = p."account_id"
  JOIN LATERAL (
    SELECT v."id", v."version"
    FROM "kpi_profile_versions" v
    WHERE v."profile_id" = p."id"
    ORDER BY v."version" DESC
    LIMIT 1
  ) lv ON TRUE
  JOIN "kpi_profile_metrics" m ON m."profile_version_id" = lv."id"
  JOIN "kpi_metric_defs" d ON d."id" = m."metric_def_id"
  WHERE p."employee_id" IS NOT NULL
    AND p."archived" = FALSE
    AND d."archived" = FALSE
) src
-- Bir xodimda bir necha profil bo'lsa g'olib BARQAROR bo'lsin (tasodifiy emas).
ORDER BY src."employee_id", src."key", src."version" DESC, src."account_id"
ON CONFLICT ("employee_id", "metric_key", "period") DO NOTHING;
-- <<< BACKFILL END
