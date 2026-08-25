-- G6 (omborchi-TSD rejasi) — TSD ish ekranlari: yetishmovchilik belgisi va
-- oflayn amalning idempotentlik kaliti.
--
-- 1) `restock_task_lines` ga YETISHMOVCHILIK ustunlari.
--    Omborchi javonda tovarni topolmasa qatorni «tasdiqlangan» deb belgilay
--    olmaydi (bu yolg'on bo'lardi), lekin topshiriq ham ochiq qolib ketmasligi
--    kerak — aks holda chek kontrol navbatiga TUSHMAYDI (G2 sharti: hamma
--    topshiriq yopiq) va kassir chekni umuman yopolmaydi. Ya'ni belgisi
--    bo'lmagan yetishmovchilik 2026-08-24 hodisasining boshqa shakli edi.
--
--    Ustun ALOHIDA (qator `quantity` sini kamaytirish EMAS): qator kassir
--    chekining nusxasi va uni omborchi o'zgartirsa chek bilan topshiriq
--    jimgina ajralardi. Chekni FAQAT kontrol tahrirlaydi (`control-edit`).
--
-- 2) `client_operations` — TSD oflayn navbatining idempotentlik kaliti.
--    Uzilgan amal qayta yuboriladi; uzilish server amalni bajargandan KEYIN
--    ham bo'lishi mumkin ⇒ kalitsiz qayta yuborish qoldiqni ikki marta
--    siljitardi. Kalit AYNAN mutatsiya tranzaksiyasi ichida da'vo qilinadi.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lishi SHART.

ALTER TABLE "restock_task_lines" ADD COLUMN IF NOT EXISTS "shortage_qty" DECIMAL(20,6);
ALTER TABLE "restock_task_lines" ADD COLUMN IF NOT EXISTS "shortage_note" TEXT;
ALTER TABLE "restock_task_lines" ADD COLUMN IF NOT EXISTS "shortage_at" TIMESTAMPTZ;
ALTER TABLE "restock_task_lines" ADD COLUMN IF NOT EXISTS "shortage_by_id" UUID;
ALTER TABLE "restock_task_lines" ADD COLUMN IF NOT EXISTS "shortage_by_name" VARCHAR(255);

CREATE TABLE IF NOT EXISTS "client_operations" (
  "id"           UUID         NOT NULL,
  "account_id"   UUID         NOT NULL,
  "client_op_id" VARCHAR(64)  NOT NULL,
  "route"        VARCHAR(120) NOT NULL,
  "employee_id"  UUID,
  "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_operations_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "client_operations"
    ADD CONSTRAINT "client_operations_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Idempotentlikning O'ZAGI: takror kalit shu indeksda yiqiladi va effekt
-- takrorlanmaydi. Unikallik akkaunt ichida (kalitni klient beradi).
CREATE UNIQUE INDEX IF NOT EXISTS "client_operations_account_id_client_op_id_key"
  ON "client_operations"("account_id", "client_op_id");

-- Eski kalitlarni tozalash uchun (kelajakdagi ish — hozircha qator kichik).
CREATE INDEX IF NOT EXISTS "client_operations_account_id_created_at_idx"
  ON "client_operations"("account_id", "created_at");
