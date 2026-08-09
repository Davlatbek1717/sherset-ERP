/**
 * Onlayn buyurtma webhook'ining KIRUVCHI imzo protokoli (F042 · 2-bo'lim TZ §4.4).
 *
 * Shartnoma (kanal sozlamalarida sir bo'lgan har qanday tashqi do'kon/marketpleys uchun):
 *
 *   POST /api/v1/webhooks/online-orders/<channelId>
 *   X-Sherset-Signature: sha256=<hex>
 *   <xom JSON tana>
 *
 *   hex = HMAC_SHA256(xom tana baytlari, kanal siri)
 *
 * **Nega xom tana?** Qayta-serializatsiya qilingan JSON (`JSON.stringify(parsed)`) probel,
 * kalit tartibi va son formatiga bog'liq ⇒ to'g'ri imzoni ham yiqitardi. Shuning uchun
 * Fastify adapteri `rawBody: true` bilan ishga tushiriladi (`main.ts`) va imzo aynan
 * o'sha baytlar ustidan tekshiriladi — Stripe/GitHub bilan bir xil naqsh.
 *
 * **Nega `secretEquals`?** Endpoint guard'siz va ochiq. Oddiy `===` birinchi farqli
 * baytda to'xtaydi ⇒ javob vaqti orqali imzoni bayt-bayt topish mumkin (timing-oracle).
 * `secretEquals` ikkala tomonni SHA-256 ga o'tkazib `timingSafeEqual` qiladi
 * (`modules/shared/timing-safe.ts`, INT-01/INT-14 naqshi).
 *
 * **Nega vaqt-tamg'asi (replay oynasi) yo'q?** Takroriy yuborish shu qatlamda emas,
 * **idempotentlik** qatlamida to'siladi: `(channelId, externalOrderId)` unique ⇒ o'sha
 * hodisa qayta kelsa ikkinchi hujjat tug'ilmaydi. Vaqt-tamg'asi kelajakda qo'shilsa
 * imzo bazasiga `timestamp + '.' + body` sifatida kiradi (F042b).
 */

import { createHmac } from 'node:crypto';
import { secretEquals } from '../shared/timing-safe.js';

/** Fastify sarlavha nomlarini kichik harfga tushiradi — shu ko'rinishda saqlaymiz. */
export const INBOUND_SIGNATURE_HEADER = 'x-sherset-signature';

/** Imzo prefiksi (GitHub uslubi). Prefiks ixtiyoriy — xom hex ham qabul qilinadi. */
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Tana ustidan HMAC-SHA256 hex hisoblaydi.
 *
 * Sir bo'sh bo'lsa THROW qiladi: «sirsiz imzo» degan tushuncha yo'q, va jim
 * qaytarilgan qiymat kalitsiz imzoni haqiqiydek ko'rsatib qo'yardi.
 */
export function computeInboundSignature(rawBody: string | Buffer, secret: string): string {
  if (!secret) throw new Error('computeInboundSignature: secret is empty');
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Kiruvchi so'rov imzosini tekshiradi. FAIL-CLOSED — quyidagilarning har biri `false`:
 * tana yo'q · sarlavha yo'q/bo'sh · sir sozlanmagan · hex mos kelmadi.
 */
export function verifyInboundSignature(
  rawBody: string | Buffer | null | undefined,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (rawBody === null || rawBody === undefined) return false;
  if (!signatureHeader || !secret) return false;

  const provided = signatureHeader.trim().toLowerCase();
  const hex = provided.startsWith(SIGNATURE_PREFIX)
    ? provided.slice(SIGNATURE_PREFIX.length)
    : provided;
  if (!hex) return false;

  return secretEquals(computeInboundSignature(rawBody, secret), hex);
}
