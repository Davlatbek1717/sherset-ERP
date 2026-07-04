-- Telegram Business (Sherset custom): the owner's Premium account connects the
-- bot as a business chatbot; we store the connection and mirror client chats +
-- messages so counterparty cards can show the conversation and send replies
-- from the owner's own name.

-- 1 — connection fields on telegram_configs
ALTER TABLE "telegram_configs"
  ADD COLUMN "business_connection_id" VARCHAR(64),
  ADD COLUMN "business_user_id" BIGINT,
  ADD COLUMN "business_user_name" VARCHAR(128);

-- 2 — chats
CREATE TABLE "telegram_chats" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "first_name" VARCHAR(128),
    "last_name" VARCHAR(128),
    "username" VARCHAR(64),
    "counterparty_id" UUID,
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_chats_account_id_chat_id_key" ON "telegram_chats"("account_id", "chat_id");
CREATE INDEX "telegram_chats_account_id_counterparty_id_idx" ON "telegram_chats"("account_id", "counterparty_id");
CREATE INDEX "telegram_chats_account_id_last_message_at_idx" ON "telegram_chats"("account_id", "last_message_at" DESC);

ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_counterparty_id_fkey"
  FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3 — messages
CREATE TABLE "telegram_chat_messages" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "chat_ref_id" UUID NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "text" VARCHAR(4096) NOT NULL,
    "tg_message_id" BIGINT,
    "sender_name" VARCHAR(128),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_chat_messages_account_id_chat_ref_id_created_at_idx"
  ON "telegram_chat_messages"("account_id", "chat_ref_id", "created_at" DESC);

ALTER TABLE "telegram_chat_messages" ADD CONSTRAINT "telegram_chat_messages_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_chat_messages" ADD CONSTRAINT "telegram_chat_messages_chat_ref_id_fkey"
  FOREIGN KEY ("chat_ref_id") REFERENCES "telegram_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
