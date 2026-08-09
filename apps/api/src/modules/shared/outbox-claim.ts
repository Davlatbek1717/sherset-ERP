/**
 * Outbox eksklyuziv «claim» siyosati — INT-08 / HR-4 / INT-09 (Faza 28, 2026-08-09).
 *
 * MUAMMO
 * ------
 * Besh cron-worker (hr-telegram-outbox, webhook-delivery, sms-delivery,
 * email-delivery, telegram drainOutbox) navbatni bir xil naqsh bilan
 * bo'shatardi:
 *
 *   1. `findMany({ status: 'pending', nextRetryAt: { lte: now } })`
 *   2. provayderga yubor
 *   3. muvaffaqiyat bo'lsa `update({ status: 'sent' })`
 *
 * Ikkita nuqson bor edi:
 *
 * **(a) Qator hech kim tomonidan EGALLANMAYDI.** Ikki jarayon (pm2 cluster,
 * ikkinchi VPS, deploy paytidagi eski+yangi process) bir xil qatorni ko'radi
 * va IKKALASI ham yuboradi. HR outbox'da «atomik guard» bor edi, lekin u
 * `pending → pending` yozardi (`hr-telegram-outbox-worker.service.ts:81`) —
 * chiqib ketmaydigan holat, shuning uchun raqibning `updateMany`i ham
 * `count = 1` qaytaradi. Ya'ni guard hech nimani qulflamasdi.
 *
 * **(b) Yuborish → keyin-status tartibi.** Provayder qabul qilgandan keyin,
 * `update({status:'sent'})` dan OLDIN process o'lsa, qator `pending` bo'lib
 * qoladi va keyingi tick uni QAYTA yuboradi.
 *
 * YECHIM
 * ------
 * `pending|retry → 'sending'` — **chiqib ketadigan** oraliq holat. Postgres
 * ReadCommitted'da `updateMany WHERE id=? AND status IN ('pending','retry')`
 * qator-qulfini oladi; raqib shu yerda kutadi va qulf bo'shagach predikatni
 * QAYTA baholaydi ⇒ `count = 0`. Faqat `count === 1` bo'lgan worker yuboradi.
 * Bu — `transition-with-claim.ts` dagi hujjat-FSM claim'ining aynan o'zi,
 * navbat-jadvallari uchun moslashtirilgani.
 *
 * `'sending'` holati **ijaraga (lease)** ega: claim paytida `nextRetryAt`
 * kelajakka (default +5 daq) qo'yiladi. Worker o'lsa, qator abadiy
 * `'sending'` da qolib ketmaydi — reaper (`nextRetryAt <= now` bo'lgan
 * `'sending'` qatorlar) uni navbatga qaytaradi va urinish-hisoblagichini
 * oshiradi (cheksiz sikl bo'lmasligi uchun).
 *
 * QOLGAN XAVF (halol yorliq)
 * --------------------------
 * Claim provayder-chaqiruvidan OLDIN yozilgani uchun oyna torayadi, lekin
 * «provayder qabul qildi → process o'ldi → ijara tugadi → qayta yuborildi»
 * dublikati **butunlay yopilmaydi**: buning uchun provayder tomonidagi
 * idempotentlik kaliti kerak (Telegram MTProto `random_id`, Eskiz tomonida
 * esa bunday kafolat yo'q). Shu sabab:
 *   · webhook — `Idempotency-Key` sarlavhasi bilan iste'molchiga dedup
 *     imkoniyati beriladi (at-least-once shartnomasi saqlanadi);
 *   · foydalanuvchiga ko'rinadigan kanallar (SMS/email/telegram/HR) — QAYTA
 *     urinishda (birinchi urinishda EMAS) bir xil xabar yaqinda muvaffaqiyatli
 *     yuborilganmi deb tekshiriladi va topilsa yuborish o'tkazib yuboriladi.
 * MTProto `random_id` plumbing'i — hujjatlangan davomi (adapter shartnomasi
 * o'zgarishi kerak), bu fazada QILINMADI.
 */

/**
 * Worker provayderga murojaat qilayotgan payt qator turadigan oraliq holat.
 * `'processing'` EMAS — `webhook.schema.test.ts` aynan shu so'zni rad etishni
 * qulflab qo'ygan, va `'sending'` navbat-jadvallarining `sent` lug'atiga
 * yaqinroq.
 */
export const OUTBOX_SENDING = 'sending';

/** Claim ijarasi (default 5 daqiqa). Barcha provayder-chaqiruvlari 10-30s
 * timeout'ga ega, shuning uchun 5 daqiqa «worker o'ldi» degani. */
const DEFAULT_LEASE_MS = 5 * 60 * 1000;

/** Qayta-urinish dedup oynasi (default 24 soat) — «kunlik dedup». */
const DEFAULT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function positiveEnvMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** `OUTBOX_CLAIM_LEASE_MS` bilan sozlanadi. */
export function outboxLeaseMs(): number {
  return positiveEnvMs('OUTBOX_CLAIM_LEASE_MS', DEFAULT_LEASE_MS);
}

/** `OUTBOX_DEDUP_WINDOW_MS` bilan sozlanadi. */
export function outboxDedupWindowMs(): number {
  return positiveEnvMs('OUTBOX_DEDUP_WINDOW_MS', DEFAULT_DEDUP_WINDOW_MS);
}

/** Claim paytida `nextRetryAt` ga yoziladigan ijara tugash vaqti. */
export function claimLeaseUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + outboxLeaseMs());
}

/** Dedup qidiruvining quyi chegarasi (`sentAt >= dedupSince()`). */
export function dedupSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - outboxDedupWindowMs());
}

/** Reaper navbatga qaytargan qatorga yoziladigan izoh. */
export const LEASE_EXPIRED_NOTE =
  'claim lease expired — worker restarted mid-send; delivery outcome unknown, re-queued';

/** Dedup tufayli yuborilmagan qatorga yoziladigan izoh. */
export function dedupNote(sentAt: Date | null | undefined): string {
  const when = sentAt ? ` at ${sentAt.toISOString()}` : '';
  return `dedup: identical message already delivered${when} — re-send suppressed (INT-09)`;
}
