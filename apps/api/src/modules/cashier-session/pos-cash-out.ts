/**
 * Kassadan pul chiqishi — xarajat (RKO) va inkassatsiya qoidalari
 * (kassa TZ §8.2 / §8.3).
 *
 * Sof modul: Prisma ham, soat ham yo'q. Bu yerdagi qarorlar — «bu hujjat
 * to'g'rimi», «bu audit hodisasini yozish kerakmi», «Z-hisobotda qanday
 * guruhlanadi» — servis ichida yashasa, ularni sinash uchun butun DB
 * ko'tarish kerak bo'lardi va shuning uchun sinalmasdi.
 *
 * **Egasining modeli (Q10): kassir erkin — tasdiq YO'Q.** Shuning uchun bu
 * yerdagi tekshiruvlar «ruxsat bermaslik» emas, `«hujjat o'zi buzuq»`
 * darajasida: moddasiz xarajat yoki qabul qiluvchisiz inkassatsiya —
 * keyinchalik hech kim o'qiy olmaydigan yozuv. Erkinlikning narxi — izlanish
 * (§9 audit jurnali), taqiq emas.
 */

/** Pul yashiqdan nega chiqdi. */
export const CASH_OUT_KIND = {
  /** Xarajat — modda tanlanadi, RKO cheki chiqadi (§8.2). */
  expense: 'expense',
  /** Inkassatsiya — pulni topshirish, qabul qiluvchi ko'rsatiladi (§8.3). */
  collection: 'collection',
  /** Tasniflanmagan — eski «Изъятие» yozuvlari. Yangi hujjat bunday bo'lmaydi. */
  other: 'other',
} as const;

export type CashOutKind = (typeof CASH_OUT_KIND)[keyof typeof CASH_OUT_KIND];

export interface CashOutInput {
  kind: CashOutKind;
  sumMinor: bigint;
  expenseItemId?: string | null;
  recipientId?: string | null;
  description?: string | null;
}

export interface CashOutProblem {
  field: 'sumMinor' | 'expenseItemId' | 'recipientId' | 'kind';
  message: string;
}

/**
 * Hujjatning O'ZI to'g'rimi (ruxsat masalasi emas).
 *
 * Har muammo ALOHIDA qaytariladi — birinchisida to'xtash kassirni bir
 * necha marta yuborardi: summa tuzatilgach «modda ham yo'q» chiqardi.
 */
export function validateCashOut(input: CashOutInput): CashOutProblem[] {
  const problems: CashOutProblem[] = [];

  if (input.sumMinor <= 0n) {
    problems.push({ field: 'sumMinor', message: 'Summa noldan katta bo`lishi kerak' });
  }

  if (input.kind === CASH_OUT_KIND.expense && !input.expenseItemId) {
    // Moddasiz xarajat — «pul ketdi, nimaga — noma'lum». Z-hisobotdagi
    // moddalar kesimi (§8.5) uni ko'rsata olmaydi.
    problems.push({ field: 'expenseItemId', message: 'Xarajat moddasini tanlang' });
  }

  if (input.kind === CASH_OUT_KIND.collection && !input.recipientId) {
    // Qabul qiluvchisiz inkassatsiya — javobgar yo'q. Pul yo'qolsa kim
    // topshirganini emas, KIM QABUL QILGANINI aniqlab bo'lmaydi.
    problems.push({ field: 'recipientId', message: 'Pulni qabul qiluvchini tanlang' });
  }

  // Chalkash hujjat: inkassatsiyaga modda biriktirilsa Z-hisobotda u ham
  // xarajat moddasi kesimiga, ham inkassatsiyaga tushib, ikki marta
  // o'qilardi.
  if (input.kind !== CASH_OUT_KIND.expense && input.expenseItemId) {
    problems.push({
      field: 'expenseItemId',
      message: 'Xarajat moddasi faqat xarajat hujjatida bo`ladi',
    });
  }
  if (input.kind !== CASH_OUT_KIND.collection && input.recipientId) {
    problems.push({
      field: 'recipientId',
      message: 'Qabul qiluvchi faqat inkassatsiyada ko`rsatiladi',
    });
  }

  return problems;
}

/** Hujjat raqami prefiksi — turi hujjat nomidan ko'rinib tursin. */
export function cashOutPrefix(kind: CashOutKind, year: number): string {
  if (kind === CASH_OUT_KIND.expense) return `РКО-${year}-`;
  if (kind === CASH_OUT_KIND.collection) return `ИНК-${year}-`;
  return `ИЗ-${year}-`;
}

// ── Audit hodisalari (§9) ───────────────────────────────────────────────────

export const CASH_OUT_EVENT = {
  expense: 'CASH_EXPENSE',
  collection: 'CASH_COLLECTION',
  /** Yashiqda yo'q pul chiqarildi — TAQIQ emas, ko'rinadigan anomaliya. */
  overdrawn: 'CASH_OVERDRAWN',
} as const;

export type CashOutEventType = (typeof CASH_OUT_EVENT)[keyof typeof CASH_OUT_EVENT];

export interface CashOutAuditEvent {
  type: CashOutEventType;
  docId: string | null;
  payload: Record<string, unknown>;
}

export interface CashOutAuditArgs {
  docId: string;
  docName: string;
  kind: CashOutKind;
  sumMinor: bigint;
  expenseItemId?: string | null;
  expenseItemName?: string | null;
  recipientId?: string | null;
  recipientName?: string | null;
  description?: string | null;
  /**
   * Hujjatdan OLDINGI kutilgan naqd. `null` = hisoblab bo'lmadi (masalan
   * smena hali yopilmagan va oraliq ma'lumot yetishmaydi) — bu holda
   * «yetarli emas» degan xulosa chiqarilmaydi: noma'lum ≠ nol.
   */
  cashBeforeMinor?: bigint | null;
}

/**
 * Bitta pul-chiqishi qanday iz qoldiradi.
 *
 * Har xarajat/inkassatsiya YOZILADI (TZ §8.2: «tasdiq shart emas, lekin har
 * xarajat audit jurnaliga tushadi»). Bundan tashqari, agar hujjat yashiqdagi
 * naqddan OSHIB ketsa — ikkinchi hodisa. U ham to'xtatmaydi: kassaga tashqi
 * pul kiritilgan bo'lishi mumkin va uni bloklash haqiqiy ishni buzardi.
 * Lekin bu holat menejer ko'rishi kerak bo'lgan raqam.
 */
export function planCashOutAuditEvents(args: CashOutAuditArgs): CashOutAuditEvent[] {
  const base: Record<string, unknown> = {
    name: args.docName,
    kind: args.kind,
    sumMinor: args.sumMinor.toString(),
    ...(args.description ? { description: args.description } : {}),
  };

  const events: CashOutAuditEvent[] = [];

  if (args.kind === CASH_OUT_KIND.expense) {
    events.push({
      type: CASH_OUT_EVENT.expense,
      docId: args.docId,
      payload: {
        ...base,
        expenseItemId: args.expenseItemId ?? null,
        expenseItemName: args.expenseItemName ?? null,
      },
    });
  } else if (args.kind === CASH_OUT_KIND.collection) {
    events.push({
      type: CASH_OUT_EVENT.collection,
      docId: args.docId,
      payload: {
        ...base,
        recipientId: args.recipientId ?? null,
        recipientName: args.recipientName ?? null,
      },
    });
  }

  // `null` = noma'lum, `0n` = haqiqatan bo'sh yashiq. Ikkalasini
  // aralashtirish har smena boshida soxta ogohlantirish bergan bo'lardi.
  if (args.cashBeforeMinor != null && args.sumMinor > args.cashBeforeMinor) {
    events.push({
      type: CASH_OUT_EVENT.overdrawn,
      docId: args.docId,
      payload: {
        ...base,
        cashBeforeMinor: args.cashBeforeMinor.toString(),
        shortByMinor: (args.sumMinor - args.cashBeforeMinor).toString(),
      },
    });
  }

  return events;
}

// ── Z-hisobot guruhlash (§8.5) ──────────────────────────────────────────────

export interface CashOutRow {
  kind: string;
  sumMinor: bigint;
  expenseItemId?: string | null;
  expenseItemName?: string | null;
}

export interface CashOutSummary {
  /** Xarajatlar jami. */
  expenseMinor: bigint;
  /** Inkassatsiya jami. */
  collectionMinor: bigint;
  /** Tasniflanmagan eski «Изъятие». */
  otherMinor: bigint;
  /** Barchasi — smena naqdidan chiqqan jami summa. */
  totalMinor: bigint;
  /** Moddalar kesimi (§8.5 «xarajatlar (moddalar bo'yicha)»). */
  byExpenseItem: Array<{ id: string | null; name: string | null; sumMinor: bigint }>;
}

/**
 * Z-hisobot uchun guruhlash.
 *
 * `totalMinor` uchtasining yig'indisi — smena yakunidagi formula (§8.4)
 * «− xarajatlar − inkassatsiya» deb ikkitasini alohida yozadi, lekin
 * naqddan chiqadigan jami summa uchalasini ham o'z ichiga oladi:
 * tasniflanmagan eski yozuv ham pul chiqishi bo'lgan.
 */
export function summarizeCashOut(rows: ReadonlyArray<CashOutRow>): CashOutSummary {
  let expenseMinor = 0n;
  let collectionMinor = 0n;
  let otherMinor = 0n;
  const items = new Map<string, { id: string | null; name: string | null; sumMinor: bigint }>();

  for (const r of rows) {
    if (r.kind === CASH_OUT_KIND.expense) {
      expenseMinor += r.sumMinor;
      // Moddasiz xarajat DB'da bo'lishi mumkin (eski ma'lumot) — uni
      // tashlab yuborish kesim yig'indisini jami bilan mos kelmasligiga
      // olib kelardi, shuning uchun `null` kaliti bilan ko'rinadi.
      const key = r.expenseItemId ?? '';
      const prev = items.get(key);
      items.set(key, {
        id: r.expenseItemId ?? null,
        name: r.expenseItemName ?? null,
        sumMinor: (prev?.sumMinor ?? 0n) + r.sumMinor,
      });
    } else if (r.kind === CASH_OUT_KIND.collection) {
      collectionMinor += r.sumMinor;
    } else {
      otherMinor += r.sumMinor;
    }
  }

  return {
    expenseMinor,
    collectionMinor,
    otherMinor,
    totalMinor: expenseMinor + collectionMinor + otherMinor,
    // Kattadan kichikka: menejer eng katta xarajat moddasini birinchi ko'rsin.
    byExpenseItem: [...items.values()].sort((a, b) =>
      b.sumMinor === a.sumMinor ? 0 : b.sumMinor > a.sumMinor ? 1 : -1,
    ),
  };
}
