/**
 * Chekning to'lov qatlami — UCHALA renderer'ning YAGONA manbasi.
 *
 * NEGA ALOHIDA MODUL (xotira: «ombor cheki uch renderer»): mijoz cheki uch
 * joyda chiziladi — `print-agent.ts` dagi `buildReceiptText` (ESC/POS matn),
 * o'sha yerdagi `buildReceiptHtml` (Electron native) va
 * `app/print/retail-sale/[id]/page.tsx` (brauzer). Har biri to'lovni O'ZI
 * o'qiganda biri jimgina eskiradi.
 *
 * 2026-08-11 auditida o'lchangan uchta buzuqlik aynan shundan edi:
 *  · «Terminal» qatori HECH QACHON chiqmasdi — renderer'lar `RetailSale` da
 *    mavjud bo'lmagan `terminalAmountMinor` ustunini o'qirdi, terminal puli
 *    esa `legacyTotals` orqali «Karta» bo'lib ko'rinardi;
 *  · «Qarz» qatori o'lik edi — `advancePaymentSumMinor` ga hech kim yozmaydi,
 *    ya'ni qarzga sotilgan chekda 60 000 qayerdaligi haqida bironta qator yo'q;
 *  · dollar qatori (CASH_USD) umuman yo'q edi.
 *
 * Endi manba bitta: `RetailSalePayment` qatorlari (`GET /retail-sales/:id` →
 * `payments`, server tomonda `retail-sale-detail-payments.test.ts` qulflagan).
 *
 * 🔴 So'mdagi ekvivalent (`amountBaseMinor`) SERVERNIKI. FE uni kursdan qayta
 * hisoblamaydi — server `usdBaseMinor()` bilan yozgan, chekда aynan o'sha
 * raqam turishi kerak (aks holda chek serverdagi pul bilan tiyinda farq qiladi).
 */

/** `GET /retail-sales/:id` → `payments[]` qatori (BigInt'lar satr bo'lib keladi). */
export interface ReceiptPaymentRow {
  method: string;
  amountMinor: string;
  currency: string;
  rateMinor: string | null;
  amountBaseMinor: string;
}

export interface ReceiptPaymentSource {
  payments?: ReceiptPaymentRow[] | null;
  /** Legacy fallback — to'lov qatorlari paydo bo'lishidan oldingi cheklar. */
  cashAmountMinor?: string | null;
  cardAmountMinor?: string | null;
  changeMinor?: string | null;
}

export type ReceiptLineKind =
  | 'cash'
  | 'cashUsd'
  | 'card'
  | 'terminal'
  | 'account'
  | 'debt'
  | 'prepay'
  | 'other'
  | 'change';

export interface ReceiptPaymentLine {
  kind: ReceiptLineKind;
  /** Chekdagi yorliq. Uchala renderer bir xil lug'atdan foydalanadi. */
  label: string;
  /** Hisob valyutasidagi (so'm) summa — chekning o'ng ustuni. */
  baseMinor: bigint;
  /**
   * Faqat chet-valyutali qatorda: mijoz BERGAN asl summa va chekka
   * MUZLATILGAN kurs (kanonik ×10^8). Kurs yo'q buzuq qatorda `null` —
   * qator baribir bosiladi, chek yo'qolmaydi.
   */
  foreign: { amountMinor: bigint; currency: string; rateMinor: bigint } | null;
}

/** To'lov turlarining chekdagi tartibi — kassir odatlangan ketma-ketlik. */
const ORDER = ['CASH_UZS', 'CASH_USD', 'CARD', 'TERMINAL', 'ACCOUNT', 'PREPAY', 'DEBT'] as const;

const KIND_OF: Record<string, Exclude<ReceiptLineKind, 'other'>> = {
  CASH_UZS: 'cash',
  CASH_USD: 'cashUsd',
  CARD: 'card',
  TERMINAL: 'terminal',
  // Hisob raqamidan (bank o'tkazmasi, 2026-08-31) — sotuvda ham, qarz
  // to'lovida ham bitta kanal nomi.
  ACCOUNT: 'account',
  // A2 (2026-08-25) — avansdan to'lov. Bu XARITAGA qo'shilmasa qator
  // `other` bo'lib chekning OXIRIDA, xom `PREPAY` so'zi bilan bosilardi
  // (mijozga beriladigan qog'ozda inglizcha texnik kalit).
  PREPAY: 'prepay',
  DEBT: 'debt',
};

/**
 * Chek yorliqlari — ataylab shu yerda, i18n'da EMAS: chek MIJOZGA beriladigan
 * qog'oz hujjat va kassirning interfeys tiliga qarab o'zgarmasligi kerak
 * (mavjud renderer'lar ham shu konventsiyada). Uchala renderer bitta lug'at.
 */
export const RECEIPT_PAYMENT_LABELS: Record<Exclude<ReceiptLineKind, 'other'>, string> = {
  cash: 'Naqd',
  cashUsd: 'Dollar',
  card: 'Karta',
  terminal: 'Terminal',
  account: 'Hisob raqamidan',
  debt: 'Qarz',
  // A2 — mijoz uchun matn: pul bugun berilmadi, avvalgi avansdan yechildi.
  prepay: 'Avansdan',
  change: 'Qaytim',
};

function toBigInt(v: string | null | undefined): bigint {
  if (v == null || v === '') return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/**
 * Chek uchun to'lov qatorlari — kanonik tartibda, nol summalarsiz,
 * oxirida qaytim (agar bor bo'lsa).
 */
export function receiptPaymentLines(sale: ReceiptPaymentSource): ReceiptPaymentLine[] {
  const rows = sale.payments ?? [];
  const out: ReceiptPaymentLine[] = [];

  if (rows.length === 0) {
    // Eski chek: `RetailSalePayment` qatorlari yo'q. Legacy ustunlardan
    // o'qiymiz — aks holda arxivdagi chek to'lovsiz bosilardi.
    const cash = toBigInt(sale.cashAmountMinor);
    const card = toBigInt(sale.cardAmountMinor);
    if (cash > 0n)
      out.push({
        kind: 'cash',
        label: RECEIPT_PAYMENT_LABELS.cash,
        baseMinor: cash,
        foreign: null,
      });
    if (card > 0n)
      out.push({
        kind: 'card',
        label: RECEIPT_PAYMENT_LABELS.card,
        baseMinor: card,
        foreign: null,
      });
  } else {
    // Bir kanalning bir nechta qatori qo'shiladi; noma'lum kanal (kelgusi
    // CLICK/PAYME/QR) tartibning OXIRIGA tushadi — lekin TUSHIB QOLMAYDI:
    // «bilinmagan to'lovni ko'rsatmaslik» aynan tuzatilayotgan bug klassi.
    const known = new Map<string, ReceiptPaymentLine>();
    const other: ReceiptPaymentLine[] = [];
    for (const r of rows) {
      const base = toBigInt(r.amountBaseMinor);
      const kind = KIND_OF[r.method];
      if (!kind) {
        other.push({ kind: 'other', label: r.method, baseMinor: base, foreign: null });
        continue;
      }
      const rate = toBigInt(r.rateMinor);
      const foreign =
        r.currency && r.currency !== 'UZS' && rate > 0n
          ? { amountMinor: toBigInt(r.amountMinor), currency: r.currency, rateMinor: rate }
          : null;
      const prev = known.get(r.method);
      if (prev) {
        prev.baseMinor += base;
        if (prev.foreign && foreign) prev.foreign.amountMinor += foreign.amountMinor;
      } else {
        known.set(r.method, {
          kind,
          label: RECEIPT_PAYMENT_LABELS[kind],
          baseMinor: base,
          foreign,
        });
      }
    }
    for (const method of ORDER) {
      const line = known.get(method);
      if (line && line.baseMinor !== 0n) out.push(line);
    }
    for (const line of other) if (line.baseMinor !== 0n) out.push(line);
  }

  const change = toBigInt(sale.changeMinor);
  if (change > 0n) {
    out.push({
      kind: 'change',
      label: RECEIPT_PAYMENT_LABELS.change,
      baseMinor: change,
      foreign: null,
    });
  }
  return out;
}

/** Valyuta belgisi — chek uchun minimal jadval (kengaytiriladi). */
const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', RUB: '₽' };

/**
 * Chet valyuta sentini chop etish uchun major ko'rinish: `1250n` → `$12.50`.
 *
 * Manfiy qiymatda minus BELGIDAN OLDIN (`-$10.00`) — audit-to'lqinidagi
 * 21-bug bilan bir xil qoida («$-10.00» kassirni chalg'itardi).
 */
export function formatForeignMajor(minor: bigint, currency: string): string {
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const cents = abs % 100n;
  const sym = SYMBOL[currency] ?? `${currency} `;
  return `${sign}${sym}${whole}.${cents.toString().padStart(2, '0')}`;
}

/**
 * Muzlatilgan kurs (kanonik ×10^8) → chekdagi o'nlik ko'rinish
 * (`1245027000000n` → `12450.27`). Faqat KO'RSATISH uchun — hisob emas.
 */
export function formatFrozenRate(rateMinor: bigint): string {
  const whole = rateMinor / 100_000_000n;
  const frac = (rateMinor % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}
