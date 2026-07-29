/**
 * Serializable tranzaksiya konflikti → avtomat qayta urinish.
 *
 * NIMA UCHUN KERAK (2026-07-29 da o'lchangan)
 * -------------------------------------------
 * Qoldiqqa ta'sir qiluvchi post yo'llari `$transaction(..., { isolationLevel:
 * 'Serializable' })` ichida yuradi — bu to'g'ri, chunki u oversell va manfiy
 * qoldiqni ildizdan yopadi. LEKIN PostgreSQL Serializable konfliktni NAVBATGA
 * QO'YMAYDI — u tranzaksiyani BEKOR qiladi (`40001 could not serialize access
 * due to concurrent update`).
 *
 * Jonli o'lchov: 20 dona qoldiqqa qarshi 10 ta parallel chiqim yuborilganda
 * atigi **2 tasi o'tdi, 8 tasi 40001 bilan yiqildi**. Ma'lumot buzilmadi
 * (yakuniy qoldiq aynan to'g'ri chiqdi), lekin foydalanuvchi 10 tadan 8 tasida
 * xom baza xatosini ko'rardi — holbuki ularning aksariyati shunchaki qayta
 * urinilsa muvaffaqiyatli bo'lardi.
 *
 * Bu yerda POST yo'li qayta urinishga XAVFSIZ: bekor qilingan tranzaksiya
 * to'liq rollback bo'ladi (hech qanday qisman yozuv qolmaydi) va qayta urinish
 * hujjat holatini (draft → posted) yangidan o'qiydi, ya'ni ikki marta post
 * bo'lib ketmaydi — holat tekshiruvi tranzaksiya ichida.
 *
 * Nima QAYTA URINILMAYDI: biznes xatolari (yetarli qoldiq yo'q, noto'g'ri
 * holat, validatsiya) — ular determinstik va qayta urinish faqat kechikish
 * qo'shadi.
 */

/** Postgres serializatsiya/deadlock kodlari. */
const PG_SERIALIZATION_FAILURE = '40001';
const PG_DEADLOCK_DETECTED = '40P01';

/**
 * Xato serializatsiya konfliktimi?
 *
 * Prisma buni ikki xil shaklda yuzaga chiqaradi:
 *   - `P2034` — "Transaction failed due to a write conflict or a deadlock"
 *     (odatiy Prisma operatsiyalari uchun);
 *   - `P2010` + `meta.code === '40001'` — tranzaksiya ichidagi `$queryRaw`
 *     yiqilganda (bizdagi `lockBalances` aynan shunday: `SELECT … FOR UPDATE`).
 * Ba'zi drayver yo'llarida faqat matn qoladi, shuning uchun matn ham tekshiriladi.
 */
export function isSerializationConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; meta?: { code?: unknown }; message?: unknown };

  if (e.code === 'P2034') return true;
  const metaCode = e.meta?.code;
  if (metaCode === PG_SERIALIZATION_FAILURE || metaCode === PG_DEADLOCK_DETECTED) return true;
  if (e.code === PG_SERIALIZATION_FAILURE || e.code === PG_DEADLOCK_DETECTED) return true;

  const msg = typeof e.message === 'string' ? e.message : '';
  return (
    msg.includes('could not serialize access') ||
    msg.includes('deadlock detected') ||
    msg.includes(`Code: \`${PG_SERIALIZATION_FAILURE}\``) ||
    msg.includes(`Code: \`${PG_DEADLOCK_DETECTED}\``)
  );
}

export interface SerializationRetryOptions {
  /** Umumiy urinishlar soni (birinchisi ham shu ichida). Default 4. */
  attempts?: number;
  /** Birinchi kutish, ms. Har urinishda ikkilanadi. Default 25ms. */
  baseDelayMs?: number;
  /**
   * Jitter uchun 0..1 tasodifiy son beruvchi. Testda determinstik qilish uchun
   * uzatiladi; ishlab chiqarishda `Math.random`.
   */
  random?: () => number;
  /** Kutish (testda darhol qaytadigan qilib uzatiladi). */
  sleep?: (ms: number) => Promise<void>;
  /** Har qayta urinishda chaqiriladi — log uchun. */
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * `fn` ni serializatsiya konfliktida qayta yugurtiradi.
 *
 * Kechikish eksponensial + jitter: birinchi konfliktdan keyin hamma raqib
 * bir vaqtda qaytmasin (aks holda o'sha zahoti yana to'qnashadi).
 */
export async function withSerializationRetry<T>(
  fn: () => Promise<T>,
  opts: SerializationRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 4);
  const base = opts.baseDelayMs ?? 25;
  const rnd = opts.random ?? Math.random;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = i === attempts - 1;
      if (isLast || !isSerializationConflict(err)) throw err;
      // 25 · 2^i ms asos + shuncha jitter ⇒ [base·2^i, base·2^(i+1))
      const delay = Math.round(base * 2 ** i * (1 + rnd()));
      opts.onRetry?.(i + 1, delay, err);
      await sleep(delay);
    }
  }
  // Mantiqan yetib bo'lmaydi (oxirgi urinish yuqorida throw qiladi).
  throw lastErr;
}
