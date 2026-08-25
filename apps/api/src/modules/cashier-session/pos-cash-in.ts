/**
 * Kassaga pul KIRISHI — «Внесение» va MIJOZ AVANSI qoidalari
 * (A1, 2026-08-25; reja §1.3).
 *
 * Sof modul: Prisma ham, soat ham yo'q — `pos-cash-out.ts` ning kirim
 * tomonidagi ko'zgusi. Ikkalasi bir xil skeletda tursin degan talab
 * ataylab: «bir tomonda tur qo'shildi, ikkinchisida unutildi» sinfi shu
 * simmetriya buzilganda tug'iladi.
 *
 * 🔴 AVANS QARZ EMAS (reja invariant 4). Bu yerdagi hech bir funksiya
 * `Debt` reyestri haqida bilmaydi va bilmasligi ham kerak: mijozning
 * oldindan bergan puli — MANFIY `CounterpartyBalance`, ya'ni BIZ unga
 * qarzdormiz. Undirish ro'yxati, qo'ng'iroq jadvali va eslatma cron'i
 * bu hujjatni hech qachon ko'rmaydi.
 */

/** Pul yashiqqa nega kirdi. */
export const CASH_IN_KIND = {
  /**
   * «Внесение» — kassirning o'z kirimi (mayda pul, smena boshidagi to'ldirish).
   * Kontragent YO'Q, kontragent balansiga TEGMAYDI.
   */
  topup: 'topup',
  /**
   * A1 — MIJOZ AVANSI (oldindan to'lov). `agentId` MAJBURIY va o'sha
   * tranzaksiyada kontragent balansiga `−sumMinor` yoziladi («biz mijozga
   * qarzdormiz»). Pul yashiqqa jismonan tushgani uchun hujjat shu jadvalda
   * turadi ⇒ kutilgan-naqd formulasiga (§8.4) O'Z-O'ZIDAN kiradi.
   */
  customerPrepay: 'customer_prepay',
  /** Tasniflanmagan — eski «Внесение» yozuvlari. Yangi hujjat bunday bo'lmaydi. */
  other: 'other',
} as const;

export type CashInKind = (typeof CASH_IN_KIND)[keyof typeof CASH_IN_KIND];

export interface CashInInput {
  kind: CashInKind;
  sumMinor: bigint;
  /** Kontragent — `customer_prepay` da MAJBURIY, boshqa turlarda TAQIQ. */
  counterpartyId?: string | null;
  description?: string | null;
}

export interface CashInProblem {
  field: 'sumMinor' | 'counterpartyId' | 'kind';
  message: string;
}

/**
 * Hujjatning O'ZI to'g'rimi (ruxsat masalasi emas) — `validateCashOut` naqshi.
 *
 * Har muammo ALOHIDA qaytariladi: birinchisida to'xtash kassirni bir necha
 * marta yuborardi.
 */
export function validateCashIn(input: CashInInput): CashInProblem[] {
  const problems: CashInProblem[] = [];

  if (input.sumMinor <= 0n) {
    problems.push({ field: 'sumMinor', message: 'Summa noldan katta bo`lishi kerak' });
  }

  if (input.kind === CASH_IN_KIND.customerPrepay && !input.counterpartyId) {
    // Mijozsiz avans — «pul keldi, kimniki — noma'lum». Balansga yozib
    // bo'lmaydi, ya'ni pul yashiqda turadi-yu, mijoz uni ishlata olmaydi.
    problems.push({ field: 'counterpartyId', message: 'Mijozni tanlang' });
  }

  // Chalkash hujjat: kontragentli «Внесение» balansga TEGMAYDI, lekin
  // ekranda mijozga bog'langandek ko'rinardi — kassir uni avans deb
  // o'ylab ikkinchi marta kiritishi mumkin edi.
  if (input.kind !== CASH_IN_KIND.customerPrepay && input.counterpartyId) {
    problems.push({
      field: 'counterpartyId',
      message: 'Mijoz faqat avans hujjatida ko`rsatiladi',
    });
  }

  return problems;
}

/**
 * Hujjat raqami prefiksi — turi hujjat nomidan ko'rinib tursin.
 *
 * `АВ-` (avans) ataylab `ВН-` dan ajratildi: kassir qog'ozdagi raqamga
 * qarab «bu mijozning puli edi» ni hujjatni ochmasdan bilishi kerak.
 */
export function cashInPrefix(kind: CashInKind, year: number): string {
  if (kind === CASH_IN_KIND.customerPrepay) return `АВ-${year}-`;
  return `ВН-${year}-`;
}

/**
 * Pul daftaridagi (`MoneyOperation.description`) izoh — hujjat TURINI aytadi.
 *
 * `/money` lentasida ikkala kirim ham bitta `drawer_cash_in` slug'i ostida
 * turadi (ular haqiqatan bitta jadval), shuning uchun «bu nima edi» savoliga
 * javob beradigan yagona joy — shu izoh (`cashOutLedgerLabel` naqshi).
 */
export function cashInLedgerLabel(kind: CashInKind): string {
  if (kind === CASH_IN_KIND.customerPrepay) return 'Mijoz avansi';
  return 'Внесение';
}

// ── Audit hodisalari (§9) ───────────────────────────────────────────────────

export const CASH_IN_EVENT = {
  /** A1 — mijozdan oldindan to'lov qabul qilindi. */
  customerPrepay: 'CUSTOMER_PREPAY',
} as const;

export type CashInEventType = (typeof CASH_IN_EVENT)[keyof typeof CASH_IN_EVENT];

export interface CashInAuditEvent {
  type: CashInEventType;
  docId: string | null;
  payload: Record<string, unknown>;
}

export interface CashInAuditArgs {
  docId: string;
  docName: string;
  kind: CashInKind;
  sumMinor: bigint;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  /**
   * Kontragent balansi hujjatdan OLDIN (tiyin). `null` = qator YO'Q
   * («o'lchanmagan», 0 EMAS) — auditda ikkalasi hech qachon
   * aralashtirilmaydi, aks holda «avans qarz ustiga tushdi» degan
   * xulosa o'lchanmagan mijozda ham chiqarilardi.
   */
  balanceBeforeMinor?: bigint | null;
  description?: string | null;
}

/**
 * Bitta pul-kirishi qanday iz qoldiradi.
 *
 * Faqat avans yoziladi: «Внесение» kassirning texnik amali va u
 * kutilgan-naqd formulasida allaqachon ko'rinadi. Avans esa MIJOZNING
 * puli — «kim, qancha, qachon qoldirdi» savoliga hujjatsiz ham javob
 * bo'lishi kerak, shuning uchun nomlar MUZLATIB yoziladi
 * (`planCashOutAuditEvents` naqshi).
 *
 * `balanceBeforeMinor` payloadda qoladi: mijoz QARZDOR bo'la turib avans
 * qoldirsa (balans > 0), pul qarzni yopadi — bu normal, lekin menejer
 * keyin «nega avans qoldig'i ko'rinmadi» deb so'raganda javob shu yerda.
 */
export function planCashInAuditEvents(args: CashInAuditArgs): CashInAuditEvent[] {
  if (args.kind !== CASH_IN_KIND.customerPrepay) return [];

  return [
    {
      type: CASH_IN_EVENT.customerPrepay,
      docId: args.docId,
      payload: {
        name: args.docName,
        kind: args.kind,
        sumMinor: args.sumMinor.toString(),
        counterpartyId: args.counterpartyId ?? null,
        counterpartyName: args.counterpartyName ?? null,
        balanceBeforeMinor: args.balanceBeforeMinor?.toString() ?? null,
        ...(args.description ? { description: args.description } : {}),
      },
    },
  ];
}

// ── Z-hisobot guruhlash (§8.5) ──────────────────────────────────────────────

export interface CashInRow {
  kind: string;
  sumMinor: bigint;
}

export interface CashInSummary {
  /** «Внесение» jami. */
  topupMinor: bigint;
  /** A1 — mijozlardan qabul qilingan avans jami. */
  customerPrepayMinor: bigint;
  /** Tasniflanmagan eski «Внесение». */
  otherMinor: bigint;
  /** Barchasi — smena naqdiga kirgan jami summa (`drawerInMinor` bilan TENG). */
  totalMinor: bigint;
}

/**
 * Z-hisobot uchun guruhlash (`summarizeCashOut` ning ko'zgusi).
 *
 * `totalMinor` uchtasining yig'indisi va u `collectCashInputs.drawerInMinor`
 * bilan AYNAN teng bo'lishi SHART — ikkalasi ham shu jadvalning butun
 * smena kesimini yig'adi. Farq chiqsa bu «bir tomonda filtr bor,
 * ikkinchisida yo'q» degani.
 */
export function summarizeCashIn(rows: ReadonlyArray<CashInRow>): CashInSummary {
  let topupMinor = 0n;
  let customerPrepayMinor = 0n;
  let otherMinor = 0n;

  for (const r of rows) {
    if (r.kind === CASH_IN_KIND.topup) topupMinor += r.sumMinor;
    else if (r.kind === CASH_IN_KIND.customerPrepay) customerPrepayMinor += r.sumMinor;
    else otherMinor += r.sumMinor;
  }

  return {
    topupMinor,
    customerPrepayMinor,
    otherMinor,
    totalMinor: topupMinor + customerPrepayMinor + otherMinor,
  };
}
