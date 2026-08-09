import { z } from 'zod';
import { BRIEFING_KIND } from './day-briefing.js';

/**
 * MK19 — brifing HTTP sxemasi.
 *
 * Tur ro'yxati sof moduldan quriladi (qo'lda takrorlanmaydi): yangi tur
 * qo'shilsa sxema o'zi biladi, ikkita ro'yxat bir-biridan uzoqlashmaydi.
 */
export const BriefingKindSchema = z.enum([BRIEFING_KIND.morning, BRIEFING_KIND.evening]);

/**
 * `chatId` ATAYLAB ixtiyoriy: sukut bo'yicha akkauntning `defaultChatId` si
 * ishlatiladi. Berilsa — o'sha chatga ketadi (masalan egasining shaxsiy
 * kanali). `TelegramOutbox.chat_id` VarChar(40) ⇒ shu chegara.
 */
export const BriefingSendSchema = z.object({
  chatId: z.string().min(1).max(40).optional(),
});

export type BriefingSendInput = z.infer<typeof BriefingSendSchema>;
