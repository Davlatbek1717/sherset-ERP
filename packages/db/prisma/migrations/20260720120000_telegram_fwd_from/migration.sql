-- FORWARD QILINGAN XABAR KO'RSATKICHI (2026-07-20 talab, Phase 2).
--
-- Mijoz (yoki egasi) chatga boshqa joydan forward qilingan xabar yuborsa,
-- Telegram'ning o'zidagi kabi "Переслано от: X" ko'rsatkichi chiqishi kerak.
-- Asl jo'natuvchi ismi/kanal nomi shu ustunga saqlanadi — MTProto'da
-- `Message.forward.sender`/`fwdFrom.fromName`dan, Business/Bot API'da
-- `forward_origin`dan olinadi.
--
-- Additive: mavjud xabarlar fwd_from_name=NULL (forward emas) bo'lib qoladi.

ALTER TABLE "telegram_chat_messages"
  ADD COLUMN "fwd_from_name" VARCHAR(128);
