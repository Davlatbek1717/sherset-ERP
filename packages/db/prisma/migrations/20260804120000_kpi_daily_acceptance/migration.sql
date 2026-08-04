-- Kunlik KPI qabul qilish: holat maydonlari + APPEND-ONLY hodisa jurnali (TZ 4M.2 §3).
--
-- employee_daily_kpi:
--   queued_at       — kun navbatga qachon tushgan; eskalatsiya soati SHUNDAN
--                     sanaladi (updated_at har tuzatmada siljib navbatni abadiy
--                     «yangi» qilib qo'yardi).
--   accepted_by_id  — kim qabul qilgan (FK YO'Q: aktyor o'chirilsa ham iz qoladi).
--   accepted_at     — qachon.
--   score_percent   — 🔴 qabul lahzasidagi kompozit ball MUZLATILADI: keyin
--                     og'irlik o'zgartirilsa, to'langan oylik ortidagi raqam
--                     qayta hisoblanib boshqacha chiqmasin (tan narx muzlatish
--                     bilan bir klass).
--   score_coverage  — ball og'irliklarning qanchasini qamragan (0…1).
--
-- employee_daily_kpi_events — har qabul/rad/tuzatma/eskalatsiya yozuvi. Hech
--   qachon UPDATE/DELETE qilinmaydi (shuning uchun updated_at yo'q). Egaga
--   haftalik xulosa (M-Q7) shu jadvaldan quriladi.
--
-- Qaytarish: DROP TABLE "employee_daily_kpi_events";
--            ALTER TABLE "employee_daily_kpi" DROP COLUMN queued_at, accepted_by_id,
--              accepted_at, score_percent, score_coverage;

-- AlterTable
ALTER TABLE "employee_daily_kpi" ADD COLUMN "queued_at" TIMESTAMPTZ;
ALTER TABLE "employee_daily_kpi" ADD COLUMN "accepted_by_id" UUID;
ALTER TABLE "employee_daily_kpi" ADD COLUMN "accepted_at" TIMESTAMPTZ;
ALTER TABLE "employee_daily_kpi" ADD COLUMN "score_percent" DECIMAL(7,2);
ALTER TABLE "employee_daily_kpi" ADD COLUMN "score_coverage" DECIMAL(5,4);

-- CreateTable
CREATE TABLE "employee_daily_kpi_events" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "daily_kpi_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "from_state" VARCHAR(20) NOT NULL,
    "to_state" VARCHAR(20) NOT NULL,
    "actor_type" VARCHAR(10) NOT NULL,
    "actor_id" UUID,
    "reason_code" VARCHAR(40),
    "note" VARCHAR(1000),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_daily_kpi_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_daily_kpi_events_daily_kpi_id_created_at_idx" ON "employee_daily_kpi_events"("daily_kpi_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_daily_kpi_events_account_id_created_at_action_idx" ON "employee_daily_kpi_events"("account_id", "created_at" DESC, "action");

-- AddForeignKey
ALTER TABLE "employee_daily_kpi_events" ADD CONSTRAINT "employee_daily_kpi_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_daily_kpi_events" ADD CONSTRAINT "employee_daily_kpi_events_daily_kpi_id_fkey" FOREIGN KEY ("daily_kpi_id") REFERENCES "employee_daily_kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
