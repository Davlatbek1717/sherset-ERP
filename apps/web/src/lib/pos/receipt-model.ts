import { amountInWords } from '@moysklad/money';
/**
 * KASSA CHEKI — MIJOZGA BERILADIGAN QOG'OZNING YAGONA MODELI (sof modul).
 *
 * ## Nega bu modul bor
 * Chekning **uchta** renderer'i bor va ular bir-birini ko'rmaydi
 * (xotira: `ombor-chek-uch-renderer`):
 *   1. `buildReceiptText`  — ESC/POS matn (agent orqali chop etadi);
 *   2. `buildReceiptHtml`  — Electron `printSheet` (qobiqdagi jim chop);
 *   3. `/print/retail-sale/[id]` — brauzer popup'i (zaxira yo'l).
 * Biri o'zgarsa qolgani JIMGINA eskiradi — kassir esa qaysi yo'l ishlaganini
 * bilmaydi. Shuning uchun **qaror va formatlash shu yerda bir marta**
 * bajariladi, renderer'lar faqat CHIZADI.
 *
 * ## Shablon
 * Egasi bergan namuna (`chek.png`, 2026-08-12) — `TovarChek` (buyurtma/
 * jo'natma cheki) bilan AYNI tuzilish:
 *
 *   Tashkilot nomi (qalin, markazda) · telefon · «SAVDO CHEKI № N» · «Sana: …»
 *   Sotuvchi / Xaridor / Izoh
 *   № | Nomi | O'lch. birligi | Soni | Narxi | Summa
 *   Chek bo'yicha umumiy summa · Chegirma · **Jami summa**
 *   Jami nomenklaturalar soni · Raqam bilan (summa so'z bilan)
 *   ─────
 *   «Ushbu chek to'lovni tasdiqlovchi hujjat hisoblanadi.»
 *   «Rahmat, bizni tanlaganingiz uchun!»
 *
 * ## 🔴 Namunadan ATAYLAB bitta chetlanish: TO'LOV QATORLARI
 * Namunada to'lov turlari yo'q. Lekin kassa chekida ular **pul ma'nosiga
 * ega**: qaytim (mijozga qancha qaytdi) va qarz (qancha to'lanmadi) qog'ozda
 * ko'rinmasa, nizoni hal qiladigan dalil qolmaydi. Shuning uchun jami'dan
 * KEYIN qisqa to'lov bloki qo'shiladi — ayni shablon uslubida. Buni olib
 * tashlash oson (`payments` massivini chizmaslik), lekin **jimgina** emas.
 */

import {
  type ReceiptPaymentRow,
  formatForeignMajor,
  formatFrozenRate,
  receiptPaymentLines,
} from './receipt-payments';

/**
 * Chek yorliqlari. Matn/HTML renderer'lari React'dan tashqarida ishlaydi
 * (next-intl hook'i yo'q), shuning uchun yorliqlar shu yerda konstanta.
 * `receipt-model.test.ts` har birini `messages/uz.json` dagi `chek_*` kaliti
 * bilan solishtiradi — ikki manba jimgina ajralib ketmasin.
 */
export const RECEIPT_LABELS = {
  titleSale: 'SAVDO CHEKI',
  titleReturn: 'Qaytarish cheki',
  date: 'Sana',
  seller: 'Sotuvchi',
  buyer: 'Xaridor',
  comment: 'Izoh',
  colName: 'Nomi',
  colUom: "O'lch. birligi",
  colQty: 'Soni',
  colPrice: 'Narxi',
  colSum: 'Summa',
  subtotal: "Chek bo'yicha umumiy summa",
  discount: 'Chegirma',
  total: 'Jami summa',
  itemsCount: 'Jami nomenklaturalar soni',
  itemsUnit: 'ta',
  /** P05 (2026-08-13, egasi): kontragentli chek oxirida qolgan qarz. */
  debtAfter: 'Sizning qarzingiz',
  inWords: 'Raqam bilan',
  footerLegal: "Ushbu chek to'lovni tasdiqlovchi hujjat hisoblanadi.",
  footerThanks: 'Rahmat, bizni tanlaganingiz uchun!',
} as const;

export interface ReceiptSaleInput {
  name: string;
  moment: string;
  sumMinor: string;
  payments?: ReceiptPaymentRow[] | null;
  cashAmountMinor: string;
  cardAmountMinor: string;
  changeMinor: string;
  description: string | null;
  /** `id` chop-nuqtada qarz so'rovi uchun kerak (P05) — eski chaqiruvchilarda yo'q bo'lishi mumkin. */
  agent: { id?: string; name: string; legalTitle: string | null } | null;
  /**
   * P05 — chekdan KEYINGI qarz qoldig'i (`/debts/pos/summary` → payableMinor;
   * kam to'lov qarzi post()'da balansga allaqachon yozilgan). Chop-nuqta
   * so'rab beradi; so'rov yiqilsa `null` = O'LCHANMAGAN (0 EMAS — xotira
   * `pos-customer-card-one-number`) va qator chizilmaydi, chek to'xtamaydi.
   */
  debtAfterMinor?: bigint | null;
  session: {
    cashier: { name: string };
    organization: { name: string; legalTitle: string | null; phone?: string | null };
  };
  positions: Array<{
    quantity: string;
    priceMinor: string;
    sumMinor: string;
    product: { name: string; uom?: string | null } | null;
  }>;
}

export interface ReceiptRow {
  /** 1 dan boshlanadi (namunadagi «№» ustuni). */
  index: number;
  name: string;
  uom: string;
  qty: string;
  price: string;
  sum: string;
}

export interface ReceiptPaymentEntry {
  label: string;
  value: string;
  /** Chet valyutada: muzlatilgan kurs + so'm ekvivalenti (ikkinchi qator). */
  note: { left: string; right: string } | null;
}

export interface ReceiptModel {
  orgName: string;
  orgPhone: string | null;
  title: string;
  docNumber: string;
  dateLabel: string;
  sellerName: string;
  buyerName: string;
  comment: string;
  rows: ReceiptRow[];
  subtotal: string;
  discount: string;
  total: string;
  itemsCount: number;
  inWords: string;
  payments: ReceiptPaymentEntry[];
  /** P05: renderer'lar `!= null && > 0n` bo'lsagina qator chizadi. */
  debtAfterMinor: bigint | null;
}

/** Tiyin → «330 250» (butun bo'lsa kasrsiz — namunadagidek). */
export function fmtSom(minor: bigint | string): string {
  const v = typeof minor === 'bigint' ? minor : BigInt(minor || '0');
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const som = abs / 100n;
  const tiyin = abs % 100n;
  const grouped = som.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const body = tiyin === 0n ? grouped : `${grouped},${tiyin.toString().padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

/** «36.500» → «36,5» · «2» → «2» (namunada kasr vergul bilan). */
export function fmtQty(q: string): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return q;
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

/**
 * 🔴 Namunada FAQAT SANA bor (soat yo'q) — `22.07.2026`. Soat kerak bo'lsa
 * u tizimdan (chek raqami bo'yicha) topiladi; qog'ozdagi ortiqcha raqam
 * mijozga hech nima bermaydi.
 */
export function fmtReceiptDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Chekning to'liq modeli.
 *
 * `subtotal` — pozitsiyalarning narx × miqdor yalpisi, `total` — hujjat
 * summasi. Chegirma ikkisining FARQI (serverning raqamlari ustida), ya'ni
 * chekda uchala qator ham DOIM chiqadi — namunada «Chegirma: 0» ham bor.
 */
export function buildReceiptModel(sale: ReceiptSaleInput): ReceiptModel {
  const rows: ReceiptRow[] = sale.positions.map((p, i) => ({
    index: i + 1,
    name: p.product?.name ?? '—',
    uom: p.product?.uom ?? '—',
    qty: fmtQty(p.quantity),
    price: fmtSom(p.priceMinor),
    sum: fmtSom(p.sumMinor),
  }));

  const grossMinor = sale.positions.reduce((acc, p) => acc + BigInt(p.sumMinor || '0'), 0n);
  const totalMinor = BigInt(sale.sumMinor || '0');
  // Chegirma manfiy bo'lib qolmasin (yaxlitlash yoki qo'lda o'zgartirilgan
  // summa yalpidan katta bo'lishi mumkin) — bunday holda 0 ko'rsatiladi.
  const discountMinor = grossMinor > totalMinor ? grossMinor - totalMinor : 0n;

  const payments: ReceiptPaymentEntry[] = receiptPaymentLines(sale).map((p) => ({
    label: p.label,
    // 🔴 Chet valyutada mijoz BERGAN asl summa turadi, kurs esa MUZLATILGAN
    // (kanonik ×10^8 — `formatFrozenRate` dan boshqa hech narsa bilan
    // formatlanmaydi, aks holda raqam 10^8 marta xato chiqadi:
    // xotira `currency-canonical-rate-scale`).
    value: p.foreign
      ? formatForeignMajor(p.foreign.amountMinor, p.foreign.currency)
      : fmtSom(p.baseMinor),
    note: p.foreign
      ? {
          left: `1${p.foreign.currency} = ${formatFrozenRate(p.foreign.rateMinor)}`,
          right: fmtSom(p.baseMinor),
        }
      : null,
  }));

  return {
    // 🔴 Namunadagi shapka — SAVDO nomi (`name`), yuridik nom emas: mijoz
    // qo'lidagi qog'ozda «Mas'uliyati cheklangan jamiyat …» emas, do'kon nomi
    // turishi kerak. A4 hujjatlarda esa aksincha (`legalTitle`) — shuning
    // uchun bu yerda ataylab boshqacha.
    orgName: sale.session.organization.name || (sale.session.organization.legalTitle ?? ''),
    orgPhone: sale.session.organization.phone?.trim() || null,
    title: RECEIPT_LABELS.titleSale,
    docNumber: sale.name,
    dateLabel: fmtReceiptDate(sale.moment),
    sellerName: sale.session.cashier.name,
    buyerName: sale.agent ? (sale.agent.legalTitle ?? sale.agent.name) : '—',
    comment: sale.description ?? '',
    rows,
    subtotal: fmtSom(grossMinor),
    discount: fmtSom(discountMinor),
    total: fmtSom(totalMinor),
    itemsCount: rows.length,
    inWords: amountInWords(totalMinor, 'UZS', 'uz'),
    payments,
    debtAfterMinor: sale.debtAfterMinor ?? null,
  };
}

/**
 * Matnni `width` ustunga sig'diradi (ESC/POS lentasi qirqib tashlamasin).
 * So'z chegarasi bo'yicha, sig'maydigan uzun so'z majburan bo'linadi.
 */
export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (word.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
        continue;
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}
