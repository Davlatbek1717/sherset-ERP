-- «Qo'ng'iroq qilindi» belgisi + suhbat natijasi (2026-07-12 talab).
--
-- debts.last_call_at / last_call_outcome — qarzdor kartochkasidagi «qo'ng'iroq
-- qilindi» tugmasi to'ldiradi; «Qo'ng'iroq qilinganlar» bo'limi shu maydonlardan
-- filtrlanadi. debt_notes.outcome — har qo'ng'iroqning natijasi tarixda qoladi
-- (append-only jurnal buzilmaydi). Sof additive — mavjud ma'lumotga tegilmaydi.

-- AlterTable
ALTER TABLE "debts" ADD COLUMN "last_call_at" TIMESTAMPTZ;
ALTER TABLE "debts" ADD COLUMN "last_call_outcome" VARCHAR(20);

-- AlterTable
ALTER TABLE "debt_notes" ADD COLUMN "outcome" VARCHAR(20);

-- «Qo'ng'iroq qilinganlar» ro'yxati — kun kesimida tez tanlash.
CREATE INDEX "debts_account_id_last_call_at_idx" ON "debts"("account_id", "last_call_at");
