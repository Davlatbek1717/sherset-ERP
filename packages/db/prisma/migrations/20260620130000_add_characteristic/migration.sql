-- Characteristic (Характеристика модификации) — account-level dictionary of
-- variant characteristics (e.g. «Цвет», «Размер»). Reusable {id, name} entries
-- surfaced in the «Создание модификаций» modal's characteristic dropdown. A
-- Variant still stores its own [{ name, value }] JSON; this table only remembers
-- the names so the picker can suggest them. moysklad-parity (entity = variant
-- metadata characteristics).
CREATE TABLE "characteristics" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "characteristics_pkey" PRIMARY KEY ("id")
);

-- One characteristic name per account (find-or-create keys on this).
CREATE UNIQUE INDEX "characteristics_account_id_name_key" ON "characteristics"("account_id", "name");
CREATE INDEX "characteristics_account_id_idx" ON "characteristics"("account_id");

ALTER TABLE "characteristics" ADD CONSTRAINT "characteristics_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
