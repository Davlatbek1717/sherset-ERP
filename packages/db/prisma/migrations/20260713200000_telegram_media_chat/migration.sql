-- Telegram chat: MEDIA (chek rasmi) + avtomatik bog'lash (2026-07-13).
--
-- Ilgari media'li xabar butunlay tashlab yuborilardi ("skip in V1") — mijoz
-- chek rasmini yuborsa, u chatda ko'rinmasdi. Endi fayl Telegram'dan yuklab
-- olinib `attachments` ga saqlanadi va chatda rasm bo'lib chiqadi.
--
-- Additive: mavjud yozuvlar 'text' bo'lib qoladi, hech narsa yo'qolmaydi.

ALTER TABLE "telegram_chat_messages"
  ADD COLUMN "kind"          VARCHAR(16) NOT NULL DEFAULT 'text',
  ADD COLUMN "file_id"       VARCHAR(200),
  ADD COLUMN "file_name"     VARCHAR(255),
  ADD COLUMN "mime_type"     VARCHAR(100),
  ADD COLUMN "attachment_id" UUID,
  ADD COLUMN "auto_kind"     VARCHAR(20);

ALTER TABLE "telegram_chats"
  ADD COLUMN "phone"    VARCHAR(32),
  ADD COLUMN "bound_by" VARCHAR(10),
  -- Chat manbai: 'business' (egasining Telegram'i) yoki 'bot' (mijoz botga yozgan).
  -- Xabar yuborish usuli shunga bog'liq — noto'g'risi Telegram xatosi beradi.
  ADD COLUMN "source"   VARCHAR(10) NOT NULL DEFAULT 'business';

-- Telefon bo'yicha qidiruv (kontakt ulashilganda kontragent topiladi)
CREATE INDEX "telegram_chats_account_id_phone_idx"
  ON "telegram_chats" ("account_id", "phone");
