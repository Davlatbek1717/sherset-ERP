-- HR TZ §7.2 — haydovchi olgan naqd pulning kassaga topshirilishi.
--
-- Nega alohida jadval: haydovchi pulni OLGAN payt bilan kassaga TOPSHIRGAN payt
-- orasida pul «haydovchining qo'lida» turadi. Buni yozmasak, kassa qoldig'i
-- bilan real pul o'rtasidagi farq ko'rinmaydi.
--
-- Pul HARAKATI bu yerda EMAS: qabul qilinganda mavjud auditlangan `CashIn`
-- (ПКО) yaratilib post qilinadi, `cash_in_id` shunga bog'lanadi. Ya'ni bu
-- jadval — kirimning SABABI, pul reyestrining dublikati emas.
--
-- Qaytarish: DROP TABLE "driver_cash_handovers";

-- CreateTable
CREATE TABLE "driver_cash_handovers" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "shift_id" UUID,
    "trip_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UZS',
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "collected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handed_at" TIMESTAMPTZ,
    "accepted_by_id" UUID,
    "cash_in_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "driver_cash_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_cash_handovers_account_id_driver_id_status_idx" ON "driver_cash_handovers"("account_id", "driver_id", "status");

-- CreateIndex
CREATE INDEX "driver_cash_handovers_account_id_status_collected_at_idx" ON "driver_cash_handovers"("account_id", "status", "collected_at" DESC);

-- AddForeignKey
ALTER TABLE "driver_cash_handovers" ADD CONSTRAINT "driver_cash_handovers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull: kassir o'chirilsa yozuv qolsin (pul tarixi yo'qolmasin).
ALTER TABLE "driver_cash_handovers" ADD CONSTRAINT "driver_cash_handovers_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
