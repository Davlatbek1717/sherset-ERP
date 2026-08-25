/**
 * G6 — TSD ISH EKRANLARINING QAROR MODULI (sof: Prisma yo'q, Nest yo'q).
 *
 * Nega alohida fayl (G2 `retail-control.ts` naqshi): topshiriq qatorining
 * «yopiq»ligi va topshiriq holati ilgari servis ichida BITTA qatorda
 * hisoblanardi (`lines.every(l => l.confirmedAt != null)`). G6 unga ikkinchi
 * yopilish yo'lini qo'shadi (yetishmovchilik) — bunday qoida servis ichida
 * qolsa hech qachon testda qulflanmaydi va keyingi faza uni jimgina buzadi.
 * I/O servisda, QAROR shu yerda.
 */

import {
  compareDecimals,
  formatDecimalScaled,
  parseDecimalScaled,
  subtractDecimals,
} from '../shared/decimal.js';

// ─── Qator holati ───────────────────────────────────────────────────────────

/** Servis DB'dan o'qib beradigan minimal qator (Decimal → satr). */
export interface ProgressLine {
  confirmedAt: Date | string | null;
  /** MUTLAQ yetishmovchilik miqdori; NULL = belgilanmagan. */
  shortageQty?: string | null;
  /** Qatordagi TALAB qilingan miqdor. */
  quantity?: string | null;
}

/**
 * Qator YOPILDIMI — ya'ni omborchi u bilan ishini tugatdimi.
 *
 * 🔴 IKKI yo'l bilan yopiladi va ular teng emas:
 *  · `confirmedAt` — tovar TOPILDI va olindi/joylandi;
 *  · `shortageQty` — javonda YETMADI va omborchi shuni XABAR qildi.
 *
 * Ikkinchisi busiz topshiriq abadiy ochiq qolardi, chek esa kontrol navbatiga
 * TUSHMASDI (G2 sharti: hamma topshiriq yopiq) va kassir uni yopolmasdi.
 * Ya'ni «belgisiz yetishmovchilik» 2026-08-24 hodisasining boshqa shakli —
 * tizim ishlayotgandek ko'rinadi, kassa esa to'xtaydi.
 *
 * Diqqat: yetishmovchilik chek tarkibini O'ZGARTIRMAYDI. Qaror kontrolda
 * (`control-edit`, G2) — u qatorni chiqarib tashlaydi yoki kamaytiradi.
 */
export function isLineClosed(line: ProgressLine): boolean {
  if (line.confirmedAt != null) return true;
  return line.shortageQty != null;
}

/** Qatorda yetishmovchilik BOR (nol emas, belgilangan). */
export function hasShortage(line: ProgressLine): boolean {
  return line.shortageQty != null && parseDecimalScaled(line.shortageQty) > 0n;
}

/**
 * Topshiriq holati qatorlardan hisoblanadi.
 *
 * `cancelled` bu yerda HECH QACHON qaytmaydi — u manba hujjat bekor
 * qilinganda tashqaridan qo'yiladi (sxema izohi) va qatorlardan kelib
 * chiqmaydi. Chaqiruvchi bekor qilingan topshiriqni bu funksiyaga umuman
 * bermaydi.
 */
export function resolveTaskStatus(
  lines: ReadonlyArray<ProgressLine>,
): 'pending' | 'in_progress' | 'done' {
  if (lines.length === 0) return 'pending';
  if (lines.every(isLineClosed)) return 'done';
  if (lines.some(isLineClosed)) return 'in_progress';
  return 'pending';
}

// ─── Yetishmovchilik rejasi ─────────────────────────────────────────────────

export interface ShortagePlan {
  /** Bo'sh bo'lmasa amal QABUL QILINMAYDI (foydalanuvchiga ko'rsatiladi). */
  refusals: string[];
  /** Yoziladigan qiymat: satr = belgilash, `null` = belgini OLIB TASHLASH. */
  shortageQty: string | null;
  /** Hech narsa o'zgarmaydi — servis yozuvsiz qaytadi. */
  noop: boolean;
}

/**
 * Yetishmovchilik belgisi rejasi. HECH QACHON throw qilmaydi.
 *
 * 🔴 SEMANTIKA — MUTLAQ («set»), qo'shimcha («add») EMAS. Sabab TSD ning
 * oflayn navbatida: uzilgan amal qayta yuborilishi mumkin va «+3» ikkinchi
 * marta kelsa yetishmovchilik 6 ga chiqib ketardi. Mutlaq son qayta
 * yuborilganda AYNI natijani beradi — ya'ni bu yo'l idempotentlik kalitiga
 * muhtoj emas (kalit `client-op.ts` da faqat qaytarib bo'lmaydigan amallarga).
 *
 * `qty = 0` — belgini OLIB TASHLASH (ustun yana NULL bo'ladi): omborchi
 * «topolmadim» deb yuborib, keyin tovarni topib olishi normal holat.
 */
export function planShortage(
  line: { quantity: string; confirmedAt: Date | string | null; shortageQty: string | null },
  rawQty: string,
): ShortagePlan {
  const refusals: string[] = [];

  const scaled = /^\d+(\.\d{1,6})?$/.test(rawQty.trim()) ? parseDecimalScaled(rawQty.trim()) : null;
  if (scaled === null) {
    refusals.push(`Noto'g'ri miqdor: «${rawQty}»`);
    return { refusals, shortageQty: null, noop: false };
  }

  // Tasdiqlangan qator — tovar OLINGAN. Uning ustiga «yetmadi» yozish ikki
  // qarama-qarshi da'voni bitta qatorda saqlardi va kontrol qaysi biriga
  // ishonishni bilmasdi. Qator tasdiqlangach qaror kontrolda (G2).
  if (line.confirmedAt != null && scaled > 0n) {
    refusals.push('Qator allaqachon tasdiqlangan — yetishmovchilik belgilanmaydi');
  }

  if (compareDecimals(formatDecimalScaled(scaled), line.quantity) > 0) {
    refusals.push(
      `Yetishmovchilik ${formatDecimalScaled(scaled)} > talab ${line.quantity} — qatordagidan ko'p tovar yetishmasligi mumkin emas`,
    );
  }

  if (refusals.length > 0) return { refusals, shortageQty: null, noop: false };

  const next = scaled === 0n ? null : formatDecimalScaled(scaled);
  const noop = (line.shortageQty ?? null) === null ? next === null : next === line.shortageQty;
  return { refusals, shortageQty: next, noop };
}

/** Qatordan HAQIQATDA yig'ilgan miqdor: talab − yetishmovchilik. */
export function collectedQty(line: { quantity: string; shortageQty?: string | null }): string {
  if (!line.shortageQty) return line.quantity;
  const left = subtractDecimals(line.quantity, line.shortageQty);
  return compareDecimals(left, '0') < 0 ? '0' : left;
}

// ─── Marshrut tartibi (TSD ekrani) ──────────────────────────────────────────

/**
 * «01-02-03-05» → [1, 2, 3, 5]; yetishmagan bo'lak `null`.
 *
 * ⚠️ Bu `restock-task.service.ts` dagi `binSegs` bilan bir xil ish qiladi.
 * Nusxa EMAS deb aytish uchun sabab kerak: u yerdagisi yig'ish VARAG'INI
 * (chop etish) quradi va uning saralashi egasining qaroriga bog'lab
 * o'zgartirilgan (2026-08-16 — bitta varaq). Bu yerdagisi TSD EKRANINI
 * quradi. Ikkalasini bitta funksiyaga bog'lash kelajakda birining qoidasini
 * o'zgartirganda ikkinchisini jimgina buzardi.
 */
function segsOf(bin: string | null): (number | null)[] {
  const cell = bin ?? '';
  return [0, 1, 2, 3].map((i) => {
    const v = cell.split('-')[i];
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isInteger(n) ? n : null;
  });
}

export interface RouteLine {
  binLocation: string | null;
  position: number;
}

/**
 * TSD ekranida qatorlar YACHEYKA TARTIBIDA (reja G6.1: «qatorlar yacheyka
 * tartibida»). Omborchi javon bo'ylab bir yo'nalishda yuradi — ro'yxat chek
 * tartibida bo'lsa u bir javonga uch marta qaytardi.
 *
 * Yacheykasiz qatorlar OXIRIDA (ularni qidirish kerak, marshrutga tushmaydi).
 * Teng bo'lganda chekdagi asl tartib (`position`) — barqaror saralash.
 *
 * ⚠️ Chop etish varag'idagi «ilon» (serpantin) marshruti bu yerda ATAYLAB
 * YO'Q: varaqda omborchi butun ro'yxatni bir qarashda ko'radi va qaytishi
 * qimmat; TSD ekranida esa u qatorni BIRMA-BIR ochadi va o'zgaruvchan
 * yo'nalish («goh chapdan, goh o'ngdan») xatolikka olib keladi.
 */
export function sortLinesByRoute<T extends RouteLine>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => {
    const A = segsOf(a.binLocation);
    const B = segsOf(b.binLocation);
    // Yacheykasiz — oxirida.
    const aNone = A.every((v) => v === null);
    const bNone = B.every((v) => v === null);
    if (aNone !== bNone) return aNone ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const x = A[i] ?? Number.MAX_SAFE_INTEGER;
      const y = B[i] ?? Number.MAX_SAFE_INTEGER;
      if (x !== y) return x - y;
    }
    return a.position - b.position;
  });
}
