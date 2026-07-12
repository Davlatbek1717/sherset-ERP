-- Qo'ng'iroq-eslatma cron dedup belgisi (2026-07-12).
-- next_contact_at vaqti kelganda operatorga bildirishnoma yuboriladi;
-- call_reminded_at o'sha yuborilgan paytni saqlaydi — bir muddat uchun
-- qayta-qayta eslatilmaydi. Yangi sana qo'yilganda NULL'ga tushiriladi.

-- AlterTable
ALTER TABLE "debts" ADD COLUMN "call_reminded_at" TIMESTAMPTZ;

-- Cron tanlovi: vaqti kelgan, hali eslatilmagan faol qarzlar.
CREATE INDEX "debts_reminder_scan_idx" ON "debts"("account_id", "status", "next_contact_at")
  WHERE "call_reminded_at" IS NULL;
