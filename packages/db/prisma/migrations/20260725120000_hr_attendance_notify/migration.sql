-- HR Davomat → Telegram bildirishnoma: config + auto_late jarima + outbox self-send.
-- Additive + non-destructive. Prerequisite: 20260724133452_hr_timepay_attendance_core.
-- NOTE: hand-written to match schema.prisma (local DB `climart_adopt` is not
-- baselined; validated by `prisma generate` + typecheck; applied on deploy via
-- `prisma migrate deploy`).

-- AlterTable: HrTelegramOutbox — allow self-send ('me'/Saqlangan xabarlar).
-- toPhone NOT NULL → nullable (existing rows keep their value, unaffected).
ALTER TABLE "hr_telegram_outbox" ALTER COLUMN "to_phone" DROP NOT NULL;
ALTER TABLE "hr_telegram_outbox" ADD COLUMN     "to_self" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "via_slot" INTEGER;

-- AlterTable: HrBonusFineLog — link an auto_late fine to its attendance row.
ALTER TABLE "hr_bonus_fine_log" ADD COLUMN     "attendance_id" UUID;

-- CreateIndex: one auto_late fine per (attendance, source) — idempotency lock.
CREATE UNIQUE INDEX "uq_bonusfine_attendance_source" ON "hr_bonus_fine_log"("attendance_id", "source");

-- CreateTable: HrAttendanceNotifyConfig (one per account).
CREATE TABLE "hr_attendance_notify_config" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "notify_check_in" BOOLEAN NOT NULL DEFAULT true,
    "notify_check_out" BOOLEAN NOT NULL DEFAULT true,
    "director_slot" INTEGER,
    "late_fine_enabled" BOOLEAN NOT NULL DEFAULT false,
    "late_threshold_min" INTEGER NOT NULL DEFAULT 15,
    "late_fine_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "late_fine_per_minute" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hr_attendance_notify_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hr_attendance_notify_config_account_id_key" ON "hr_attendance_notify_config"("account_id");

-- AddForeignKey
ALTER TABLE "hr_attendance_notify_config" ADD CONSTRAINT "hr_attendance_notify_config_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
