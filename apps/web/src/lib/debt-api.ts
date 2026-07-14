/**
 * «Qarz undirish» (TZ v2) — API tiplari va so'rovlari.
 *
 * Server javob shakli bilan 1:1 mos (apps/api/src/modules/debt/debt.service.ts).
 * Pul — HAR DOIM minor (tiyin) string: BigInt JSON'da string bo'lib keladi
 * (main.ts BigInt.toJSON). Hech qachon `number` ga aylantirmang — 2^53 dan
 * katta tiyin summalari aniqlikni yo'qotadi.
 *
 * REAL-TIME (§3.8): kassa va call-markaz jismonan boshqa joyda. React Query
 * `refetchInterval` bilan ro'yxat va profil avtomatik yangilanadi — operator
 * mijoz kassada to'lov qilganini sahifani yangilamasdan ko'radi.
 */

import { api } from './api-client';

/** Ro'yxat/profil avtomatik yangilanish oralig'i (§3.8 «minimal kechikish»). */
export const DEBT_POLL_MS = 10_000;

export type DebtStatus = 'unpaid' | 'partial' | 'paid';
export type DebtPaymentMethod = 'cash' | 'terminal' | 'card_screenshot' | 'manual_close';
export type DebtNoteKind = 'call' | 'debt_issue' | 'payment';
export type DebtAuthorRole = 'operator' | 'cashier' | 'admin';
/**
 * Ro'yxat ko'rinishlari.
 *   problem — MUAMMOLI mijozlar (2026-07-14): operator qo'ng'iroqda belgilagan.
 */
export type DebtScope = 'active' | 'today' | 'overdue' | 'all' | 'called' | 'problem';
/** Qo'ng'iroq natijasi (2026-07-12): to'ladi / qisman / to'lamadi / qayta qo'ng'iroq. */
export type CallOutcome = 'paid_full' | 'paid_partial' | 'not_paid' | 'callback';

/**
 * Qo'ng'iroqda qabul qilingan to'lov KANALI (2026-07-13):
 *   cash  — naqd (so'm yoki dollar; dollarda kurs majburiy)
 *   click — Click/karta o'tkazmasi (chek rasmi majburiy)
 * Serverda click → method='card_screenshot' bo'lib yoziladi.
 */
export type CallPaymentKind = 'cash' | 'click';

/** To'lov valyutasi — naqd so'mda ham, dollarda ham bo'lishi mumkin. */
export type PaymentCurrency = 'UZS' | 'USD';

/** Kurs saqlanish ko'paytmasi: 12 800,50 so'm → 128 005 000. */
export const RATE_SCALE = 10_000;

export interface DebtRow {
  id: string;
  name: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  phone: string | null;
  totalMinor: string;
  paidMinor: string;
  remainingMinor: string;
  currency: string;
  status: DebtStatus;
  nextContactAt: string | null;
  /** Server hisoblaydi — keyingi aloqa sanasi o'tib ketgan (§3.5 qizil qator). */
  overdue: boolean;
  lastNote: string | null;
  /** Oxirgi qo'ng'iroq belgisi (2026-07-12). */
  lastCallAt: string | null;
  lastCallOutcome: CallOutcome | null;
  /** MUAMMOLI MIJOZ (2026-07-14) — «Muammoli qarzdorlar» bo'limi shundan. */
  problem: boolean;
  problemReason: string | null;
  problemAt: string | null;
  comment: string | null;
  ownerId: string | null;
  ownerName: string | null;
  issuedByName: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface DebtPaymentRow {
  id: string;
  /** SO'MDAGI summa (tiyin) — qarz hisobi doim shundan yuritiladi. */
  amountMinor: string;
  method: DebtPaymentMethod;
  /** To'lov valyutasi (2026-07-13): mijoz naqdni dollarda ham berishi mumkin. */
  currency: PaymentCurrency;
  /** Mijoz ASLIDA bergan summa (USD → sent). UZS to'lovda amountMinor bilan bir xil. */
  amountOriginalMinor: string | null;
  /** Kurs ×10000 (12 800,50 so'm → 128005000). Faqat USD to'lovda to'ladi. */
  exchangeRate: string | null;
  /** §3.8 — «qayerdan qabul qilingani»: kassa nomi yoki «Karta — screenshot». */
  sourceName: string | null;
  /** §3.7 — chek rasmi; `/api/v1/attachments/{id}/raw` orqali ochiladi. */
  attachmentId: string | null;
  comment: string | null;
  receivedByName: string | null;
  receivedByRole: DebtAuthorRole;
  createdAt: string;
}

export interface DebtNoteRow {
  id: string;
  text: string;
  nextContactAt: string | null;
  authorName: string | null;
  authorRole: DebtAuthorRole;
  kind: DebtNoteKind;
  createdAt: string;
}

export interface DebtDetail extends DebtRow {
  payments: DebtPaymentRow[];
  notes: DebtNoteRow[];
}

export interface DebtListResponse {
  rows: DebtRow[];
  total: number;
  outstandingMinor: string;
}

export interface DebtSummary {
  outstandingMinor: string;
  debtorCount: number;
  overdueMinor: string;
  overdueCount: number;
  todayCallCount: number;
  /** Muammoli mijozlar soni. */
  problemCount: number;
}

export interface CashierReportRow {
  cashierId: string;
  cashierName: string;
  collectedMinor: string;
  collectedCount: number;
  issuedMinor: string;
  issuedCount: number;
}

export interface CashierReport {
  date: string;
  rows: CashierReportRow[];
  totals: {
    collectedMinor: string;
    issuedMinor: string;
    collectedCount: number;
    issuedCount: number;
  };
}

export interface OperatorReportRow {
  operatorId: string;
  operatorName: string;
  callCount: number;
  screenshotCount: number;
  screenshotMinor: string;
}

export interface OperatorReport {
  date: string;
  rows: OperatorReportRow[];
}

// ── so'rovlar ────────────────────────────────────────────────────────────────

export interface DebtListParams {
  scope?: DebtScope;
  ownerId?: string;
  search?: string;
  /** Segment: qarzdor shu guruhda bo'lsin (Elektriklar tabi). */
  counterpartyGroupId?: string;
  /** Segment: shu guruhda BO'LMASIN (Boshqalar tabi). */
  counterpartyGroupExclude?: string;
  /** scope='called': qaysi kun (YYYY-MM-DD, default bugun). */
  calledDate?: string;
  /** scope='called': natija bo'yicha filtr. */
  callOutcome?: CallOutcome;
  sortBy?: 'nextContactAt' | 'remainingMinor' | 'totalMinor' | 'createdAt' | 'counterparty';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/** «To'lovlar lentasi» qatori — aynan qaysi mijoz to'lagani. */
export interface DebtPaymentFeedRow {
  id: string;
  debtId: string;
  debtName: string;
  counterpartyName: string;
  phone: string | null;
  amountMinor: string;
  method: DebtPaymentMethod;
  sourceName: string | null;
  /** Click cheki — modal oynada ochiladi (`/attachments/:id/raw`, token bilan). */
  attachmentId: string | null;
  currency: PaymentCurrency;
  amountOriginalMinor: string | null;
  exchangeRate: string | null;
  receivedByName: string | null;
  receivedByRole: DebtAuthorRole;
  /** To'lovdan keyingi qarz holati — 'paid' bo'lsa «TO'LIQ YOPILDI». */
  debtStatus: DebtStatus;
  remainingMinor: string;
  createdAt: string;
}

export interface DebtPaymentsFeed {
  rows: DebtPaymentFeedRow[];
  total: number;
  totalAmountMinor: string;
}

export interface DebtPaymentsFeedParams {
  from?: string;
  to?: string;
  method?: DebtPaymentMethod;
  search?: string;
  limit?: number;
  offset?: number;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const debtApi = {
  list: (p: DebtListParams = {}) => api.get<DebtListResponse>(`/debts${qs({ ...p })}`),

  summary: () => api.get<DebtSummary>('/debts/summary'),

  get: (id: string) => api.get<DebtDetail>(`/debts/${id}`),

  /** §3.5 — bugungi qo'ng'iroqlar (muddati o'tganlar ham, `overdue` bayrog'i bilan). */
  todayCalls: (ownerId?: string) =>
    api.get<{ rows: DebtRow[] }>(`/debts/calls/today${qs({ ownerId })}`),

  /** §3.3 — yangi qarz berish (KASSIR). Izoh + keyingi sana MAJBURIY. */
  create: (body: {
    counterpartyId: string;
    totalMinor: string;
    comment: string;
    nextContactAt: string;
    ownerId?: string | null;
  }) => api.post<DebtRow>('/debts', body),

  /** §3.4 — izoh + keyingi qo'ng'iroq vaqti (operator VA kassir). */
  addNote: (id: string, body: { text: string; nextContactAt?: string | null }) =>
    api.post<DebtNoteRow>(`/debts/${id}/notes`, body),

  /**
   * «Qo'ng'iroq qilindi» + natija (2026-07-12). callback uchun nextContactAt
   * majburiy — server ham tekshiradi.
   */
  markCall: (
    id: string,
    body: {
      outcome: CallOutcome;
      text?: string;
      nextContactAt?: string | null;
      /** To'lov bo'lgan natijalarda MAJBURIY: naqd yoki Click. */
      paymentKind?: CallPaymentKind;
      /** Naqd valyutasi (default UZS). USD bo'lsa kurs majburiy. */
      currency?: PaymentCurrency;
      /** Mijoz bergan ASL summa minor birlikda (so'm → tiyin, dollar → sent). */
      amountOriginalMinor?: string;
      /** Kurs ×10000 — USD to'lovda majburiy. */
      exchangeRate?: string;
      /** Click to'lovida chek rasmi (data-URI) — majburiy. */
      screenshotBase64?: string;
      filename?: string;
      mime?: string;
      /** Eski maydon (so'mdagi tiyin) — moslik uchun qoldirilgan. */
      amountMinor?: string;
      /** MUAMMOLI mijoz deb belgilash (sabab + qayta qo'ng'iroq sanasi majburiy). */
      problem?: boolean;
      problemReason?: string;
    },
  ) => api.post<DebtRow>(`/debts/${id}/call`, body),

  /** Muammoli belgisini qo'yish/yechish — «Muammoli qarzdorlar» sahifasidan. */
  setProblem: (
    id: string,
    body: { problem: boolean; problemReason?: string; nextContactAt?: string | null },
  ) => api.post<DebtRow>(`/debts/${id}/problem`, body),

  /** §3.6 — kassada naqd/terminal to'lov (FAQAT KASSIR). */
  addCashPayment: (
    id: string,
    body: {
      amountMinor: string;
      method: 'cash' | 'terminal';
      cashDeskId?: string | null;
      comment?: string;
      nextContactAt?: string | null;
    },
  ) => api.post<DebtRow>(`/debts/${id}/payments`, body),

  /** §3.7 — karta (screenshot) to'lovi (FAQAT OPERATOR). */
  addCardPayment: (
    id: string,
    body: {
      amountMinor: string;
      screenshotBase64: string;
      filename: string;
      mime: string;
      comment?: string;
      nextContactAt?: string | null;
    },
  ) => api.post<DebtPaymentRow>(`/debts/${id}/card-payments`, body),

  cashierReport: (date?: string) =>
    api.get<CashierReport>(`/debts/reports/cashiers${qs({ date })}`),

  operatorReport: (date?: string) =>
    api.get<OperatorReport>(`/debts/reports/operators${qs({ date })}`),

  /** «To'lovlar lentasi» — aynan qaysi mijoz to'lagani (default: bugun). */
  paymentsFeed: (p: DebtPaymentsFeedParams = {}) =>
    api.get<DebtPaymentsFeed>(`/debts/payments/feed${qs({ ...p })}`),

  /**
   * CHECKBOX bilan belgilangan qarzlar PDF'i (2026-07-12) — aynan tanlangan
   * yozuvlar, filtr holatidan qat'i nazar.
   */
  printSelectedPdf: (ids: string[], heading: string) =>
    api.postDownload(
      '/debts/print/pdf',
      { ids, heading },
      `qarzdorlar-belgilangan-${new Date().toISOString().slice(0, 10)}.pdf`,
    ),
};

/**
 * Davr bo'yicha BARCHA to'lovlarni yuklaydi (Excel eksport uchun) — server
 * sahifasi 200 ta bilan cheklangani uchun offset bo'yicha aylanadi.
 */
export async function fetchAllPayments(
  p: Omit<DebtPaymentsFeedParams, 'limit' | 'offset'>,
): Promise<DebtPaymentFeedRow[]> {
  const out: DebtPaymentFeedRow[] = [];
  let offset = 0;
  for (;;) {
    const page = await debtApi.paymentsFeed({ ...p, limit: 200, offset });
    out.push(...page.rows);
    if (out.length >= page.total || page.rows.length === 0) break;
    offset += 200;
  }
  return out;
}

/**
 * datetime-local input uchun HOZIRGI mahalliy vaqt ('YYYY-MM-DDTHH:mm').
 * To'lov formalari defaulti (2026-07-12: «to'lovda ayni vaqt tursin»).
 */
export function nowInputValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * BUGUNGI sana + 09:00 — «keyingi qo'ng'iroq» maydonlari defaulti
 * (2026-07-12: «sana ayni vaqtniki, vaqti default 9:00»).
 */
export function todayAt9InputValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return `${d.toISOString().slice(0, 10)}T09:00`;
}

/** Faylni base64 data-URI'ga o'giradi (§3.7 screenshot yuklash). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Faylni o‘qib bo‘lmadi'));
    reader.readAsDataURL(file);
  });
}

/** Chek rasmini ochish havolasi (§3.7 — nizoli holatda tekshirish). */
export function screenshotUrl(attachmentId: string): string {
  return `/api/v1/attachments/${attachmentId}/raw`;
}
