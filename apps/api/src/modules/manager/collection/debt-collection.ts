/**
 * MK16 — «QARZ UNDIRISH ISH RO'YXATI» sof qoidalari (4M TZ §8.1/2).
 *
 * Menejer bir ekranda ko'radi: **kimdan qancha** undirish kerak · **necha kun**
 * muddati o'tgan · **kim javobgar** · **oxirgi aloqa qachon** · **harakat**
 * (qo'ng'iroq / SMS / Telegram eslatma).
 *
 * ⚠️ **HECH NARSANI BLOKLAMAYDI** — bu ro'yxat sotuvni ham, qarz berishni ham
 * to'xtatmaydi (4M TZ §5.1 falsafasi, MK06 navbati bilan bir xil).
 *
 * **Ikkinchi haqiqat OCHILMAYDI:** qator manbai — mavjud `Debt` daftari
 * (call-markaz moduli). Bu yerda yangi qarz formulasi YO'Q; qoldiq
 * `totalMinor - paidMinor` — `debt-recalc.ts` dagi bir xil ta'rif. Eslatma ham
 * yangi jo'natgich qurmaydi: `DebtService.sendBulkReminders` (SMS/Telegram)
 * chaqiriladi.
 *
 * Bu fayl **SOF**: Prisma ham, Nest ham, `Date.now()` ham yo'q — «hozir» har
 * doim argument sifatida kiradi, shuning uchun har qoida testda muzlatilgan
 * vaqt bilan tekshiriladi.
 *
 * Ikki ma'lumot-sifati shartnomasi (repo bo'ylab bir xil):
 *  1. **NULL ≠ 0.** Muddat qo'yilmagan qarzning `overdueDays` i `null`, `0`
 *     EMAS — aks holda u «bugun muddati» bo'lib ko'rinardi.
 *  2. **Yorliq ≠ instant.** Kechikish KALENDAR kunlarida (Toshkent) sanaladi,
 *     `ms / 86400000` bilan emas: 23:00 dagi muddat ertasi 14:00 da 0.6 kun
 *     emas, **1 kun** kechikkan bo'ladi.
 */

import { SALE_DEBT_SOURCE_DOC_TYPE } from '../../debt/sale-debt-registry.js';

/** Toshkent = UTC+5, yil bo'yi (DST yo'q). */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Q4 — qator QAYERDAN kelgani (menejerning «bu qarz qayerdan keldi?» savoli).
 *
 *   `registry`   — qo'lda ochilgan `QRZ-…` qarzi yoki P1 adopsiya qatori
 *                  (`Debt.sourceDocType` = NULL yoki noma'lum tur);
 *   `retailsale` — KASSA CHEKIDAN avtomatik ochilgan qator (Q2).
 *
 * ⚠️ Ro'yxat YOPIQ va **fallback `registry`**: kelajakda yangi hujjat-manba
 * qo'shilsa (masalan `InvoiceOut`) u ekranda «reyestr» bo'lib ko'rinadi —
 * yolg'on emas, chunki u rostdan ham reyestr qatori; noma'lum tur uchun xom
 * satr chizish esa MK25 dagi «xom kalit ekranda» xatosining takrori bo'lardi.
 */
export type CollectionSource = 'registry' | 'retailsale';

/**
 * `Debt.sourceDocType` → ekran manbasi. **SOF** — bitta joyda, chunki bu
 * xarita server javobida ham, filtrda ham, ikki web ekranida ham ishlatiladi.
 */
export function collectionSourceOf(sourceDocType: string | null | undefined): CollectionSource {
  return sourceDocType === SALE_DEBT_SOURCE_DOC_TYPE ? 'retailsale' : 'registry';
}

/**
 * Qaysi ish guruhiga tushadi. Tartib ham shu ma'noda: `overdue` → `due_today`
 * → `upcoming` → `no_due_date`.
 */
export type CollectionBucket = 'overdue' | 'due_today' | 'upcoming' | 'no_due_date';

/** Oxirgi aloqa qaysi hodisadan kelgani (yorliqni halol ko'rsatish uchun). */
export type LastContactKind = 'call' | 'reminder' | 'note';

/** Nega «eslatma yuborish» tugmasi o'chirilgan. */
export type RemindBlockedReason = 'no_phone' | 'reminded_today';

/** Javobgar xodim va u qayerdan kelgani. */
export interface CollectionResponsible {
  id: string;
  name: string;
  /** `owner` — qarzga biriktirilgan mas'ul · `issuer` — qarzni bergan kassir. */
  role: 'owner' | 'issuer';
}

/** Bitta qarzning xom o'qilgan holati (I/O qatlami to'ldiradi). */
export interface CollectionDebtInput {
  id: string;
  /** Hujjat raqami (QRZ-YYYY-NNNNN). */
  name: string;
  counterpartyId: string;
  counterpartyName: string;
  /** Telefonsiz kontragentga eslatma ketmaydi — sabab oshkora ko'rsatiladi. */
  counterpartyPhone: string | null;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  /** `unpaid` | `partial` | `paid`. */
  status: string;
  problem: boolean;
  /** Kelishilgan keyingi aloqa/to'lov vaqti = amaldagi MUDDAT (TZ §3.3). */
  nextContactAt: Date | null;
  lastCallAt: Date | null;
  lastCallOutcome: string | null;
  /** Eng yangi jurnal yozuvi (har turdagi izoh). */
  lastNoteAt: Date | null;
  /** Eng yangi `kind='reminder'` jurnal yozuvi — idempotentlik manbai. */
  lastReminderAt: Date | null;
  responsible: CollectionResponsible | null;
  /** Q4 — `Debt.sourceDocType` (`'retailsale'` yoki NULL). */
  sourceDocType: string | null;
  /** Q4 — `Debt.sourceDocId` (chek id'si) — ekranda havola manzili. */
  sourceDocId: string | null;
  /**
   * Q4 — manba hujjatining RAQAMI (chek `CHK-…`). I/O qatlami uni
   * `RetailSale` dan o'qiydi; topilmasa `null` (chek o'chirilgan yoki qator
   * boshqa manbadan) va ekran shunda faqat belgi ko'rsatadi.
   *
   * ⚠️ `Debt.comment` ichida ham chek raqami bor, lekin unga TAYANILMAYDI:
   * u erkin matn va o'zgarishi mumkin (Q3 ning 5-eslatmasi).
   */
  sourceDocNumber: string | null;
}

/** Ekranga chiqadigan qator. */
export interface CollectionRow {
  debtId: string;
  debtName: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyPhone: string | null;
  totalMinor: bigint;
  paidMinor: bigint;
  /** Undirilishi kerak bo'lgan qoldiq (har doim > 0). */
  remainingMinor: bigint;
  currency: string;
  dueAt: Date | null;
  /** Musbat — kechikkan kun · 0 — bugun · manfiy — hali kelmagan · null — muddatsiz. */
  overdueDays: number | null;
  bucket: CollectionBucket;
  problem: boolean;
  responsible: CollectionResponsible | null;
  lastContactAt: Date | null;
  lastContactKind: LastContactKind | null;
  lastCallOutcome: string | null;
  /** Bugun (Toshkent kuni) eslatma allaqachon ketganmi. */
  remindedToday: boolean;
  canRemind: boolean;
  remindBlockedReason: RemindBlockedReason | null;
  /** Q4 — qator qayerdan keldi ({@link collectionSourceOf}). */
  source: CollectionSource;
  /** Q4 — manba hujjatining id'si (chek) yoki `null`. */
  sourceDocId: string | null;
  /** Q4 — manba hujjatining raqami (`CHK-…`) yoki `null`. */
  sourceDocNumber: string | null;
}

/** Bir sanani Toshkent kalendar kuniga (`YYYY-MM-DD`) aylantiradi. */
export function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → o'sha kun boshining UTC instanti (taqqoslash uchun). */
function dayKeyToUtcMidnight(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

/**
 * Muddatdan beri o'tgan KALENDAR kunlari (Toshkent). Musbat = kechikkan,
 * 0 = bugun, manfiy = hali kelmagan. Muddat yo'q ⇒ `null` (NULL ≠ 0).
 */
export function overdueDaysBetween(dueAt: Date | null, now: Date): number | null {
  if (!dueAt) return null;
  const due = dayKeyToUtcMidnight(tashkentDayKey(dueAt));
  const today = dayKeyToUtcMidnight(tashkentDayKey(now));
  return Math.round((today - due) / DAY_MS);
}

/** Eslatma `now` bilan BIR Toshkent kunida ketganmi. */
export function isRemindedOn(lastReminderAt: Date | null, now: Date): boolean {
  if (!lastReminderAt) return false;
  return tashkentDayKey(lastReminderAt) === tashkentDayKey(now);
}

function bucketOf(overdueDays: number | null): CollectionBucket {
  if (overdueDays === null) return 'no_due_date';
  if (overdueDays > 0) return 'overdue';
  if (overdueDays === 0) return 'due_today';
  return 'upcoming';
}

/**
 * Oxirgi aloqa — qo'ng'iroq / eslatma / izohning eng yangisi. Teng bo'lsa
 * aniqroq hodisa yutadi (qo'ng'iroq > eslatma > izoh), chunki «qo'ng'iroq
 * qilindi» «izoh yozildi» dan ko'ra ko'proq ma'lumot beradi.
 */
function resolveLastContact(input: CollectionDebtInput): {
  at: Date | null;
  kind: LastContactKind | null;
} {
  const candidates: Array<{ at: Date; kind: LastContactKind }> = [];
  if (input.lastCallAt) candidates.push({ at: input.lastCallAt, kind: 'call' });
  if (input.lastReminderAt) candidates.push({ at: input.lastReminderAt, kind: 'reminder' });
  if (input.lastNoteAt) candidates.push({ at: input.lastNoteAt, kind: 'note' });

  const rank: Record<LastContactKind, number> = { call: 0, reminder: 1, note: 2 };
  let best: { at: Date; kind: LastContactKind } | null = null;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    const dt = c.at.getTime() - best.at.getTime();
    if (dt > 0 || (dt === 0 && rank[c.kind] < rank[best.kind])) best = c;
  }
  return best ? { at: best.at, kind: best.kind } : { at: null, kind: null };
}

/**
 * Bitta qarz → ish qatori, yoki `null` agar undiriladigan narsa qolmagan
 * bo'lsa. **Chiqarish sharti qoldiq bo'yicha, status bo'yicha EMAS**: status
 * eskirib qolishi mumkin (masalan storno oralig'ida), qoldiq esa yolg'on
 * gapirmaydi.
 */
export function buildCollectionRow(input: CollectionDebtInput, now: Date): CollectionRow | null {
  const remainingMinor = input.totalMinor - input.paidMinor;
  if (remainingMinor <= 0n) return null;
  if (input.status === 'paid') return null;

  const overdueDays = overdueDaysBetween(input.nextContactAt, now);
  const lastContact = resolveLastContact(input);
  const remindedToday = isRemindedOn(input.lastReminderAt, now);
  const phone = input.counterpartyPhone?.trim() || null;

  // Telefon yo'qligi birinchi sabab: u umuman yuborib bo'lmasligini bildiradi,
  // «bugun yuborilgan» esa faqat vaqtinchalik to'siq.
  const remindBlockedReason: RemindBlockedReason | null = !phone
    ? 'no_phone'
    : remindedToday
      ? 'reminded_today'
      : null;

  return {
    debtId: input.id,
    debtName: input.name,
    counterpartyId: input.counterpartyId,
    counterpartyName: input.counterpartyName,
    counterpartyPhone: phone,
    totalMinor: input.totalMinor,
    paidMinor: input.paidMinor,
    remainingMinor,
    currency: input.currency,
    dueAt: input.nextContactAt,
    overdueDays,
    bucket: bucketOf(overdueDays),
    problem: input.problem,
    responsible: input.responsible,
    lastContactAt: lastContact.at,
    lastContactKind: lastContact.kind,
    lastCallOutcome: input.lastCallOutcome,
    remindedToday,
    canRemind: remindBlockedReason === null,
    remindBlockedReason,
    source: collectionSourceOf(input.sourceDocType),
    sourceDocId: input.sourceDocId,
    sourceDocNumber: input.sourceDocNumber,
  };
}

/**
 * TO'LIQ DETERMINIST tartib — bir xil kirish to'plami har doim bir xil
 * ketma-ketlik beradi, kirish tartibidan qat'i nazar (oxirgi kalit `debtId`
 * unikal, shuning uchun hech qachon «teng» qolmaydi):
 *
 *  1. `overdueDays` KAMAYISH bo'yicha — eng ko'p kechikkan tepada; muddatsiz
 *     (`null`) qatorlar **oxirida** (ular kechikkan deb isbotlanmagan).
 *  2. valyuta A→Z — valyutalar QO'SHILMAYDI, shuning uchun summalar faqat
 *     bir valyuta ichida taqqoslanadi (`report-conversion` shartnomasi).
 *  3. qoldiq KAMAYISH bo'yicha — kattaroq pul tepada.
 *  4. `debtId` O'SISH bo'yicha — yakuniy uzil-kesil kalit.
 */
export function compareCollectionRows(a: CollectionRow, b: CollectionRow): number {
  if (a.overdueDays === null || b.overdueDays === null) {
    if (a.overdueDays !== b.overdueDays) return a.overdueDays === null ? 1 : -1;
  } else if (a.overdueDays !== b.overdueDays) {
    return b.overdueDays - a.overdueDays;
  }
  if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
  if (a.remainingMinor !== b.remainingMinor) return a.remainingMinor > b.remainingMinor ? -1 : 1;
  return a.debtId < b.debtId ? -1 : a.debtId > b.debtId ? 1 : 0;
}

/** Undirilishi kerak bo'lgan qatorlar, determinist tartibda. */
export function buildCollectionList(inputs: CollectionDebtInput[], now: Date): CollectionRow[] {
  const rows: CollectionRow[] = [];
  for (const input of inputs) {
    const row = buildCollectionRow(input, now);
    if (row) rows.push(row);
  }
  return rows.sort(compareCollectionRows);
}

/**
 * Q4 — MANBA bo'yicha kesim (SOF).
 *
 * ⚠️ Filtr ATAYLAB sof qatlamda, Prisma `where` ida EMAS. Ikki sabab:
 *  1. `scope='due'` filtri ham AYNAN shu yerda (mavjud naqsh) — ikki filtr
 *     ikki qatlamga bo'linsa «nechta qator kesildi» hisobi ikki manbadan
 *     yig'ilardi;
 *  2. `registry` = «`retailsale` EMAS», ya'ni NULL larni ham o'z ichiga
 *     oladi. SQL'da `source_doc_type <> 'retailsale'` NULL larni CHIQARIB
 *     TASHLAYDI (`NULL <> 'x'` — UNKNOWN), ya'ni qo'lda ochilgan barcha
 *     `QRZ-` qarzlari jimgina yo'qolardi. Sof qatlamda bunday tuzoq yo'q.
 *
 * `undefined` ⇒ filtr yo'q (hamma qator qoladi).
 */
export function filterCollectionRowsBySource(
  rows: CollectionRow[],
  source: CollectionSource | undefined,
): CollectionRow[] {
  if (!source) return rows;
  return rows.filter((r) => r.source === source);
}

export interface CollectionCurrencyTotal {
  currency: string;
  remainingMinor: bigint;
  count: number;
}

export interface CollectionSummary {
  /** Valyuta bo'yicha ALOHIDA jamlar — hech qachon bitta songa qo'shilmaydi. */
  byCurrency: CollectionCurrencyTotal[];
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  /** Muddat umuman qo'yilmagan qarzlar — ma'lumot-sifati signali. */
  noDueDateCount: number;
  problemCount: number;
  /**
   * Q4 — KASSA CHEKIDAN kelgan qatorlar soni. Egasiga aynan shu son kerak
   * («kassadan qo'shilgan qarzdorliklar ko'rinmayapti»): ro'yxatdagi umumiy
   * son o'sganda menejer «bu yangi qarz emas, ko'rinmagan qarz endi
   * ko'rinmoqda» degan javobni bir qarashda oladi.
   */
  retailSaleCount: number;
  /** Q4 — reyestrda qo'lda ochilgan (yoki adopsiya) qatorlar soni. */
  registryCount: number;
}

/**
 * Yig'ma ko'rsatkichlar. Valyutalar **qo'shilmaydi**: kursi bo'lmagan
 * valyutani jamiga qo'shish yolg'on son beradi (Faza 17 shartnomasi), shuning
 * uchun har valyuta o'z qatorida, kod bo'yicha determinist tartibda.
 */
export function summarizeCollection(rows: CollectionRow[]): CollectionSummary {
  const totals = new Map<string, CollectionCurrencyTotal>();
  let overdueCount = 0;
  let dueTodayCount = 0;
  let upcomingCount = 0;
  let noDueDateCount = 0;
  let problemCount = 0;
  let retailSaleCount = 0;
  let registryCount = 0;

  for (const r of rows) {
    const t = totals.get(r.currency) ?? { currency: r.currency, remainingMinor: 0n, count: 0 };
    t.remainingMinor += r.remainingMinor;
    t.count += 1;
    totals.set(r.currency, t);

    if (r.bucket === 'overdue') overdueCount += 1;
    else if (r.bucket === 'due_today') dueTodayCount += 1;
    else if (r.bucket === 'upcoming') upcomingCount += 1;
    else noDueDateCount += 1;

    if (r.problem) problemCount += 1;

    if (r.source === 'retailsale') retailSaleCount += 1;
    else registryCount += 1;
  }

  return {
    byCurrency: [...totals.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1)),
    overdueCount,
    dueTodayCount,
    upcomingCount,
    noDueDateCount,
    problemCount,
    retailSaleCount,
    registryCount,
  };
}
