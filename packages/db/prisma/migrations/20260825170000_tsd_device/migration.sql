-- G5 (omborchi-TSD rejasi) — qo'l terminali qurilmasi + sessiyaning qurilmaga
-- bog'lanishi.
--
-- Nega ALOHIDA jadval, `pos_devices` ga `kind` ustuni emas: `pos_devices` da
-- `cash_desk_id`/`organization_id` NOT NULL (kassa smenasi uchalasini talab
-- qiladi), TSD da esa kassa yo'q. Ularni nullable qilish jonli kassa yo'lidagi
-- tip shartnomasini o'zgartirardi. Ikkinchi sabab — fail-closed: TSD kaliti
-- kassa smenasini ocholmasligi TUZILMAVIY bo'lsin, unutilgan `where` ga
-- bog'liq bo'lmasin. To'liq izoh `schema.prisma` da.
--
-- `refresh_tokens.tsd_device_id` — sessiya qaysi terminaldan ochilganini
-- SAQLAYDI. Busiz `deviceMode` da'vosi faqat 15 daqiqalik access-JWT da
-- yashardi va birinchi refresh'da TSD sessiyasi jimgina to'liq ERP sessiyasiga
-- aylanardi (`auth.service.refresh` tokenni xodimdan qayta quradi).
--
-- FK siyosati:
--   tsd_devices.account_id        — CASCADE (akkaunt bilan ketadi);
--   refresh_tokens.tsd_device_id  — RESTRICT. ATAYLAB `SET NULL` EMAS: qurilma
--     qatori o'chsa null qolgan sessiya cheklovsiz to'liq ERP sessiyasiga
--     ko'tarilardi. Qurilma baribir o'chirilmaydi — `revoked_at` qo'yiladi.
--
-- Deploy bazalari har doim ham `_prisma_migrations` bilan kuzatilmaydi
-- (20260809140000 dagi eslatma) — har qadam idempotent: qayta yugurtirish
-- no-op bo'lishi SHART.

CREATE TABLE IF NOT EXISTS "tsd_devices" (
  "id"              UUID         NOT NULL,
  "account_id"      UUID         NOT NULL,
  "name"            VARCHAR(200) NOT NULL,
  "store_id"        UUID         NOT NULL,
  "secret_hash"     VARCHAR(255) NOT NULL,
  "paired_by_id"    UUID         NOT NULL,
  "paired_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at"    TIMESTAMPTZ,
  "app_version"     VARCHAR(32),
  "revoked_at"      TIMESTAMPTZ,
  "failed_attempts" INTEGER      NOT NULL DEFAULT 0,
  "locked_until"    TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tsd_devices_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "tsd_devices"
    ADD CONSTRAINT "tsd_devices_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "tsd_devices_account_id_revoked_at_idx"
  ON "tsd_devices"("account_id", "revoked_at");

ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "tsd_device_id" UUID;

DO $$ BEGIN
  ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_tsd_device_id_fkey"
    FOREIGN KEY ("tsd_device_id") REFERENCES "tsd_devices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "refresh_tokens_tsd_device_id_idx"
  ON "refresh_tokens"("tsd_device_id");
