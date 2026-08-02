/**
 * Haydovchi ping buferi — sof mantiq (React'siz, mocksiz sinaladi).
 *
 * Nega kerak: haydovchi tunnel/zaif tarmoqda yuradi. Ping yo'qolsa smena
 * masofasi va harakat/to'xtash soniyalari kam hisoblanadi — ular esa ish
 * o'lchovi (grafiksiz smena) va kelajakdagi ish-birligiga oylik manbai.
 *
 * IKKI SHART server tomonidan MAJBURIY qilingan (`driver-field-ingest.service.ts`):
 *
 * 1. **Ketma-ket flush.** Servis izohida ochiq yozilgan ma'lum cheklov: bitta
 *    haydovchining ikki ping'i BIR VAQTDA kelsa, ikkalasi ham bir xil oldingi
 *    nuqtani o'qib masofani IKKI marta sanashi mumkin. Shuning uchun bufer
 *    parallel emas, bittalab yuboradi (`flushBuffer` ketma-ket `await`).
 * 2. **Asl vaqt saqlanadi.** Har yozuv o'z `ts` ini olib yuradi; aks holda
 *    30 daqiqadan keyin flush qilingan ping «hozir» deb yozilib, haydovchini
 *    xaritada teleport qilardi va jump-filter uni rad etardi.
 *
 * Bufer chegaralangan: eng eski yozuvlar tashlanadi (cheksiz o'sib localStorage
 * kvotasini portlatmasin — u holda joriy ping ham yozilmay qolardi).
 */

export interface BufferedPing {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  /** ISO — ping OLINGAN payt, yuborilgan payt emas. */
  ts: string;
}

/** ~3 soatlik 45s-ping (240) + zaxira. Undan oshsa eng eskisi tushadi. */
export const MAX_BUFFERED = 300;

export function appendToBuffer(buffer: BufferedPing[], ping: BufferedPing): BufferedPing[] {
  const next = [...buffer, ping];
  return next.length <= MAX_BUFFERED ? next : next.slice(next.length - MAX_BUFFERED);
}

/**
 * Buferni BITTALAB yuboradi. Birinchi xatoda to'xtaydi va yuborilmaganlarni
 * qaytaradi — tarmoq uzilganda qolganini keyingi urinishga saqlaydi va
 * tartibni buzmaydi (tartib buzilsa masofa noto'g'ri yig'iladi).
 *
 * Server ping'ni rad etsa (`accepted:false` — masalan `accuracy`/`jump`) bu
 * XATO EMAS: yozuv iste'mol qilinган hisoblanadi va bufer'dan chiqadi, aks
 * holda yaroqsiz ping abadiy qayta urinilaverardi.
 */
export async function flushBuffer(
  buffer: BufferedPing[],
  send: (p: BufferedPing) => Promise<unknown>,
): Promise<{ sent: number; remaining: BufferedPing[] }> {
  let sent = 0;
  for (let i = 0; i < buffer.length; i++) {
    const item = buffer[i];
    if (!item) continue;
    try {
      await send(item);
      sent++;
    } catch {
      return { sent, remaining: buffer.slice(i) };
    }
  }
  return { sent, remaining: [] };
}

const STORAGE_KEY = 'sherset.driver.pingBuffer.v1';

/** localStorage'дан o'qish — buzuq/eskirgan qiymat butun sahifani yiqitmasin. */
export function loadBuffer(storage: Pick<Storage, 'getItem'>): BufferedPing[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is BufferedPing =>
        !!p &&
        typeof p.lat === 'number' &&
        typeof p.lng === 'number' &&
        typeof p.accuracy === 'number' &&
        typeof p.ts === 'string',
    );
  } catch {
    return [];
  }
}

/** Yozish — kvota to'lsa jim o'tadi (ping yo'qoladi, lekin ilova yiqilmaydi). */
export function saveBuffer(storage: Pick<Storage, 'setItem'>, buffer: BufferedPing[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    /* kvota/private-mode — bufer faqat xotirada qoladi */
  }
}

export const DRIVER_BUFFER_STORAGE_KEY = STORAGE_KEY;
