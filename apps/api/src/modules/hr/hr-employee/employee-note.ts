/**
 * Suhbat va ogohlantirish jurnali (menejer TZ 4M.4 — xodim kartasi 360°).
 *
 * MUAMMO. Hozir menejer xodim bilan gaplashsa, ogohlantirsa yoki maqtasa —
 * bu hech qayerda qolmaydi. Uch oydan keyin «bu odam bilan nima gaplashildi»
 * degan savolga javob yo'q, va bo'shatish paytida «ogohlantirilganmidi?»
 * degan savol ham javobsiz qoladi.
 *
 * ⚠️ **JURNAL APPEND-ONLY: yozuv tahrirlanmaydi va o'chirilmaydi.**
 * O'chirib bo'ladigan ogohlantirish — ogohlantirish emas: noqulay yozuvni
 * keyin yo'qotish imkoni bo'lsa, jurnalning butun ma'nosi yo'qoladi.
 * Xato yozuv `void` qilinadi — u ko'rinib turadi, lekin hisobga kirmaydi.
 *
 * Sof modul — turlar, naqsh qoidasi va matn DB'siz sinaladi.
 */

export const NOTE_KIND = {
  /** Oddiy suhbat — kontekst uchun. */
  talk: 'talk',
  /** Rasmiy ogohlantirish — intizomiy iz. */
  warning: 'warning',
  /** Maqtov/tan olish — jurnal faqat salbiydan iborat bo'lmasin. */
  praise: 'praise',
} as const;

export type NoteKind = (typeof NOTE_KIND)[keyof typeof NOTE_KIND];

export function isNoteKind(v: string): v is NoteKind {
  return v === NOTE_KIND.talk || v === NOTE_KIND.warning || v === NOTE_KIND.praise;
}

export interface NoteRow {
  kind: string;
  createdAt: Date;
  /** Bekor qilingan yozuv ko'rinadi, lekin hisobga KIRMAYDI. */
  voidedAt: Date | null;
}

// ── Naqsh qoidasi ────────────────────────────────────────────────────────────

/**
 * Ogohlantirishlar shu oyna ichida sanaladi.
 *
 * 90 kun: bir yil oldingi ogohlantirish bugungi qarorga asos bo'la
 * olmaydi, lekin uch oy — naqshni ko'rish uchun yetarli davr. Oyna
 * bo'lmasa har yangi ogohlantirish abadiy yig'ilib, bir yildan keyin
 * har bir xodim «muammoli» bo'lib chiqardi.
 */
export const WARNING_WINDOW_DAYS = 90;

/**
 * Shuncha ogohlantirishdan keyin naqsh deb belgilanadi.
 *
 * 3: bitta ogohlantirish — hodisa, ikkitasi — tasodif bo'lishi mumkin,
 * uchtasi esa uch oy ichida takrorlanish. Menejer aynan shu chegarada
 * boshqa qaror qabul qiladi.
 */
export const WARNING_PATTERN_COUNT = 3;

export interface NoteSummary {
  total: number;
  talkCount: number;
  warningCount: number;
  praiseCount: number;
  /** Oyna ichidagi kuchdagi ogohlantirishlar. */
  activeWarnings: number;
  /** Takrorlanish belgisi — menejer qaror o'zgartiradigan chegara. */
  hasWarningPattern: boolean;
  lastAt: Date | null;
  /**
   * Oyna va chegara ekranga ham chiqadi: «so'nggi 90 kunda 3 ta» matnini
   * FE o'z konstantasidan yozsa, chegara bu yerda o'zgarganda ekran jimgina
   * yolg'on aytib turardi. Qoida bitta manbada qoladi.
   */
  windowDays: number;
  patternCount: number;
}

/**
 * Jurnal xulosasi.
 *
 * Bekor qilingan (`voidedAt`) yozuvlar **jami**da ham sanalmaydi: ular
 * tarixda ko'rinadi, lekin «nechta ogohlantirish bor» savoliga javob
 * bermaydi — aks holda xato yozuv abadiy xodimga qarshi turardi.
 */
export function summarizeNotes(rows: ReadonlyArray<NoteRow>, now: Date): NoteSummary {
  const live = rows.filter((r) => r.voidedAt === null);
  const windowStart = new Date(now.getTime() - WARNING_WINDOW_DAYS * 86_400_000);

  let talkCount = 0;
  let warningCount = 0;
  let praiseCount = 0;
  let activeWarnings = 0;
  let lastAt: Date | null = null;

  for (const r of live) {
    if (r.kind === NOTE_KIND.talk) talkCount += 1;
    else if (r.kind === NOTE_KIND.warning) {
      warningCount += 1;
      if (r.createdAt >= windowStart) activeWarnings += 1;
    } else if (r.kind === NOTE_KIND.praise) praiseCount += 1;
    if (lastAt === null || r.createdAt > lastAt) lastAt = r.createdAt;
  }

  return {
    total: live.length,
    talkCount,
    warningCount,
    praiseCount,
    activeWarnings,
    hasWarningPattern: activeWarnings >= WARNING_PATTERN_COUNT,
    lastAt,
    windowDays: WARNING_WINDOW_DAYS,
    patternCount: WARNING_PATTERN_COUNT,
  };
}

/**
 * Yozuv matni bo'shmi.
 *
 * Bo'sh ogohlantirish keyin hech narsani anglatmaydi: «ogohlantirildi»
 * degan yozuv nima uchun ekanini aytmasa, uch oydan keyin uni na menejer,
 * na xodim tushuntira oladi.
 */
export function isValidNoteText(text: unknown): text is string {
  return typeof text === 'string' && text.trim().length > 0;
}
