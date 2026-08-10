-- Kassa .exe PIN-kirishi (spec: docs/superpowers/specs/2026-08-10-kassa-exe-pin-design.md)
--
-- 1) employees.pos_pin_lookup — HMAC-SHA256(pin, POS_PIN_PEPPER) hex. PIN bo'yicha
--    xodimni TOPISH uchun (argon2 tuzli ⇒ qidirib bo'lmaydi). NULL = PIN yo'q.
-- 2) Unique(account_id, pos_pin_lookup) — bir akkauntda ikki kassirda bir xil PIN
--    bo'lmasin (aks holda kim kirgani noaniq). Postgres'da NULL'lar to'qnashmaydi.
-- 3) pos_devices — juftlangan kassa kompyuteri. PIN-login shu yozuvsiz ishlamaydi.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "pos_pin_lookup" VARCHAR(64);

-- CreateTable
CREATE TABLE "pos_devices" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "store_id" UUID NOT NULL,
    "cash_desk_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "secret_hash" VARCHAR(255) NOT NULL,
    "paired_by_id" UUID NOT NULL,
    "paired_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_devices_account_id_revoked_at_idx" ON "pos_devices"("account_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "employees_account_id_pos_pin_lookup_key" ON "employees"("account_id", "pos_pin_lookup");

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
