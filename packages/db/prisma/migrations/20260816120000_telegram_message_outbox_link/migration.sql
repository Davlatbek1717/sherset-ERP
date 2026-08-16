-- Telegram ip qatorini yetkazish holatiga bog'lash (2026-08-16).
--
-- Nega: `telegram_chat_messages` da yetkazish holati YO'Q — «navbatda /
-- yuborildi / yetmadi» `hr_telegram_outbox` da yashaydi. Havolasiz UI
-- `pending` ni «yuborildi» deb ko'rsatishga majbur bo'lardi.
--
-- 🔴 PRODDA (`sherset_v2`) `prisma migrate deploy` ISHLAMAYDI — bu bazada
-- migratsiya tarixi replay-buzuq. Qo'lda qo'llash:
--   psql "$DATABASE_URL" -f <shu fayl>
-- yoki `npx prisma db execute --file <shu fayl> --schema prisma/schema.prisma`
-- Ikkalasi ham IDEMPOTENT (`IF NOT EXISTS`), qayta yugurtirish xavfsiz.

ALTER TABLE "telegram_chat_messages"
  ADD COLUMN IF NOT EXISTS "outbox_id" uuid;

CREATE INDEX IF NOT EXISTS "telegram_chat_messages_account_id_outbox_id_idx"
  ON "telegram_chat_messages" ("account_id", "outbox_id");
