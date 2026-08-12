-- Faza 3 (2026-08-12) — POS qarz to'lovi IDEMPOTENTLIGI.
--
-- MUAMMO: kassa monoblokida `POST /debts/pos/pay` tranzaksiyasi COMMIT bo'ladi,
-- javob esa tarmoqda yo'qoladi (Wi-Fi uzildi). Kassir «Failed to fetch» ko'rib
-- tugmani QAYTA bosadi ⇒ IKKINCHI to'lov to'plami yozilardi: yashiqqa ikkinchi
-- kirim, smenaning «kutilgan naqd»i ikki barobar, yopishda SOXTA KAMOMAD.
--
-- NEGA ALOHIDA JADVAL: bitta jismoniy to'lov FIFO bo'yicha N ta `debt_payments`
-- qatoriga bo'linadi ⇒ kalitni o'sha qatorlarga qo'yib bo'lmaydi (unique
-- buzilardi). Bu jadval «bitta klient so'rovi = bitta chek (batch_id)» degan
-- shartnomani saqlaydi.
--
-- BACKFILL KERAK EMAS: jadval bo'sh boshlanadi va kalit IXTIYORIY — kalitsiz
-- (eski klient) so'rovlar bu yerga umuman yozilmaydi va xulqi o'zgarmaydi.
CREATE TABLE IF NOT EXISTS "pos_debt_payment_requests" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_debt_payment_requests_pkey" PRIMARY KEY ("id")
);

-- Chek (`batch_id`) bo'yicha teskari izlash — buxgalter «bu chek qaysi klient
-- so'rovidan tug'ildi?» degan savolga shu indeks bilan javob oladi.
CREATE INDEX IF NOT EXISTS "pos_debt_payment_requests_account_id_batch_id_idx" ON "pos_debt_payment_requests"("account_id", "batch_id");

-- 🔴 IDEMPOTENTLIK QULFI. Takroriy so'rov AYNAN shu indeksga urilib P2002
-- oladi va tranzaksiya orqaga qaytadi. Tenant bilan birga — bir akkauntning
-- kaliti boshqasini to'smaydi.
CREATE UNIQUE INDEX IF NOT EXISTS "pos_debt_payment_requests_account_id_client_request_id_key" ON "pos_debt_payment_requests"("account_id", "client_request_id");

ALTER TABLE "pos_debt_payment_requests" ADD CONSTRAINT "pos_debt_payment_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
