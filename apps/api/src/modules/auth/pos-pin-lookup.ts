import { createHmac } from 'node:crypto';
import { resolveSecret } from './boot-secrets.js';

/**
 * PIN-only kirishda (kassa .exe) xodimni PIN bo'yicha TOPISH kerak.
 *
 * `Employee.posPinHash` — argon2, har xesh o'z tuzi bilan, ya'ni «PIN bo'yicha
 * qidirish» imkonsiz. Butun xodimlar bo'ylab argon2 sikli yuritish ham
 * yaramaydi: 20 xodim ≈ 1 soniya (kassa tezligiga tegadi) va javob vaqti
 * xodimlar soniga bog'liq bo'lib qolardi.
 *
 * Yechim — ikkinchi, TUZSIZ lekin PEPPERLANGAN qiymat: HMAC-SHA256(pin, pepper).
 * U indekslanadi ⇒ O(1) topish. Tuzsizligi xavf emas, chunki pepper serverda
 * turadi (bazada EMAS): baza o'g'irlansa ham 10 000 ta PIN'ni oldindan
 * hisoblab bo'lmaydi.
 *
 * 🔴 SHARTNOMA: pepper o'zgarsa yoki yo'qolsa hamma `posPinLookup` yaroqsiz
 * bo'ladi. PIN saqlanmagani uchun qayta hisoblab BO'LMAYDI — PIN'lar qayta
 * beriladi. Shuning uchun prod'da pepper majburiy (pastdagi resolver) va
 * deploy hujjatida qayd etilishi shart.
 */
export function posPinLookupHash(pin: string, pepper: string): string {
  return createHmac('sha256', pepper).update(pin).digest('hex');
}

/** Dev-fallback — `boot-secrets.ts` naqshi: prod'da jim ishlamaydi, yiqiladi. */
export const POS_PIN_PEPPER_DEV_FALLBACK = 'dev-pos-pin-pepper-change-in-prod';

export function resolvePosPinPepper(
  value: string | undefined,
  nodeEnv: string | undefined,
): string {
  return resolveSecret({
    name: 'POS_PIN_PEPPER',
    value,
    devFallback: POS_PIN_PEPPER_DEV_FALLBACK,
    nodeEnv,
  });
}
