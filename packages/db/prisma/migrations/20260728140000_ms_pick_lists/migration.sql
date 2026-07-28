-- «Yig'ish ro'yxati» (pick-list / yacheykali chek) — climart port 2026-07-28.
-- Tashqi MoySklad «Заказ покупателя»/«Возврат покупателя» snapshot'i; uy-yacheyka
-- print paytida bizning mahsulotdan hal qilinadi (bu jadvalda saqlanmaydi).
-- Idempotent (IF NOT EXISTS) — drifted/re-run prod'da toza qo'llanadi.

CREATE TABLE IF NOT EXISTS "ms_pick_lists" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "ms_order_id" UUID NOT NULL,
    "doc_type" VARCHAR(30) NOT NULL DEFAULT 'customerorder',
    "name" VARCHAR(64) NOT NULL,
    "moment" TIMESTAMPTZ NOT NULL,
    "ms_updated_at" TIMESTAMPTZ NOT NULL,
    "agent_name" VARCHAR(255),
    "agent_phone" VARCHAR(64),
    "store_name" VARCHAR(255),
    "owner_name" VARCHAR(255),
    "description" TEXT,
    "sum_minor" BIGINT NOT NULL DEFAULT 0,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "payed_minor" BIGINT NOT NULL DEFAULT 0,
    "positions" JSONB NOT NULL DEFAULT '[]',
    "printed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ms_pick_lists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ms_pick_lists_account_id_ms_order_id_key"
    ON "ms_pick_lists" ("account_id", "ms_order_id");

CREATE INDEX IF NOT EXISTS "ms_pick_lists_account_id_moment_idx"
    ON "ms_pick_lists" ("account_id", "moment" DESC);
