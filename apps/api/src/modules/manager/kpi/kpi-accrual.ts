/**
 * Kunlik qabul → bonus/jarima (QAROR-B1, 4M TZ §4/2-band).
 *
 * MUAMMO. TZ «kun qabul qilinganda bonus/jarima yoziladi» deydi, lekin
 * **qancha** yozilishini aytmaydi. Formula o'ylab topilsa — odamning puli
 * taxminga qurilgan bo'lardi. Egasining qarori (2026-08-09):
 *
 *   **Ball-oralig'i (band) qoidalari — OPT-IN, qat'iy summa.**
 *   Manba raqam = qabul lahzasida MUZLATILGAN `scorePercent` (jonli qayta
 *   hisob EMAS — og'irlik keyin o'zgarsa to'langan pul o'zgarib ketardi).
 *   Sozlama = mavjud `HrBonusFineRule`, `condition = { type:'kpi_day_score',
 *   minPercent, maxPercent }`. Oraliq **yarim ochiq `[min, max)`** — shunda
 *   oraliqlar ustma-ust tushmay tiladi va «100.0 qayerga tegishli» degan
 *   savol qolmaydi.
 *
 * UCH HOLATDA PUL YOZILMAYDI (uchalasi ham ataylab):
 *   1. **Qoida yo'q** — funksiya yoqilmagan. Sukut bo'yicha hech bir hisobda
 *      pul o'z-o'zidan paydo bo'lmaydi.
 *   2. **Ball `null`** — kun ballanmagan (profil/maqsad yo'q). NULL ≠ 0:
 *      o'lchanmagan kunni «0% ⇒ jarima» deb o'qish odamdan pul olardi.
 *   3. **Ikki qoida bir vaqtda mos** — konfiguratsiya xatosi. Tavakkal
 *      summa yozishdan ko'ra **yozmaslik** xavfsiz; xato ko'rinib turadi.
 *
 * SOF MODUL — DB ham, soat ham yo'q (`kpi-correction.ts` naqshi). Servis
 * faqat shu qarorni bajaradi.
 */

/** `HrBonusFineLog.source` — qabul kanali. Boshqa manbalar bilan aralashmaydi. */
export const KPI_ACCRUAL_SOURCE = 'kpi_accept';

/** Bekor qilishning teskari qatori. O'chirish YO'Q — audit izi qoladi. */
export const KPI_ACCRUAL_REVERSAL_SOURCE = 'kpi_accept_reversal';

/** `HrBonusFineRule.condition.type` — shu kanalga tegishli qoidalar belgisi. */
export const KPI_ACCRUAL_CONDITION_TYPE = 'kpi_day_score';

export type BonusFineKind = 'bonus' | 'fine';

/** `HrBonusFineRule` qatori (faol va o'chirilmaganini chaqiruvchi filtrlaydi). */
export interface AccrualRuleInput {
  id: string;
  name: string;
  /** DB'da VarChar — 'bonus' | 'fine' dan boshqasi buzuq qoida. */
  kind: string;
  amountMinor: bigint;
  /** `condition` Json — begona/buzuq shakl e'tiborsiz qoladi. */
  condition: unknown;
}

/** Ball oralig'i: `minPercent ≤ ball < maxPercent` (`maxPercent: null` = ∞). */
export interface AccrualBand {
  minPercent: number;
  maxPercent: number | null;
}

export type AccrualSkipReason =
  /** Kun ballanmagan (NULL ≠ 0). */
  | 'no_score'
  /** Hisobda shu turdagi qoida umuman yo'q — kanal yoqilmagan. */
  | 'no_rules'
  /**
   * Qoida bor, lekin HAMMASI buzuq (oraliq/kind/summa). `no_rules` dan
   * ataylab ajratilgan: egasi sozlamoqchi bo'lgan-u xato qilgan, buni
   * «yoqilmagan» deb ko'rsatish jimgina yo'qotish bo'lardi.
   */
  | 'invalid_rules'
  /** Ball hech bir oraliqqa tushmadi — «neytral» zona (pulsiz kun). */
  | 'no_matching_band'
  /** Bir nechta oraliq mos keldi — konfiguratsiya xatosi. */
  | 'ambiguous_bands';

export type AccrualDecision =
  | {
      accrue: true;
      ruleId: string;
      ruleName: string;
      kind: BonusFineKind;
      /** Qoidadan NUSXA olinadi — keyin qoida tahrirlansa tarix o'zgarmaydi. */
      amountMinor: bigint;
      band: AccrualBand;
    }
  | {
      accrue: false;
      skipReason: AccrualSkipReason;
      /** `ambiguous_bands` da — qaysi qoidalar to'qnashdi (log uchun). */
      ruleIds?: readonly string[];
    };

export interface AccrualInput {
  /** Qabulda muzlatilgan kompozit ball, foizda. NULL = ballanmagan. */
  scorePercent: number | null;
  rules: readonly AccrualRuleInput[];
}

/**
 * Qabul qilingan kun uchun qancha yoziladi.
 *
 * Qaytadi `accrue:false` bo'lsa — **hech narsa yozilmaydi**, va `skipReason`
 * nima uchun ekanini ochiq aytadi (jimgina 0 emas: `kpi-score.ts` dagi
 * `skipReason` bilan bir xil intizom).
 */
export function planAccrual(input: AccrualInput): AccrualDecision {
  // Shu kanalga DA'VOGAR qoidalar — `condition.type` bo'yicha, to'g'riligidan
  // qat'i nazar. «Kanal yoqilmagan» va «sozlashda xato» ni shu ajratadi.
  const ours = input.rules.filter((r) => isAccrualCondition(r.condition));
  if (ours.length === 0) return { accrue: false, skipReason: 'no_rules' };

  const candidates = ours
    .map((r) => ({ rule: r, band: parseBand(r.condition), kind: parseKind(r.kind) }))
    .filter(
      (c): c is { rule: AccrualRuleInput; band: AccrualBand; kind: BonusFineKind } =>
        c.band != null && c.kind != null && c.rule.amountMinor > 0n,
    );

  if (candidates.length === 0) {
    return { accrue: false, skipReason: 'invalid_rules', ruleIds: ours.map((r) => r.id) };
  }
  // Ball tekshiruvi qoidalardan KEYIN: «qoida yo'q» va «ball yo'q» ikki
  // boshqa hodisa va logda ham ajralib turishi kerak.
  if (input.scorePercent == null || !Number.isFinite(input.scorePercent)) {
    return { accrue: false, skipReason: 'no_score' };
  }

  const score = input.scorePercent;
  const matched = candidates.filter((c) => inBand(score, c.band));
  if (matched.length === 0) return { accrue: false, skipReason: 'no_matching_band' };
  if (matched.length > 1) {
    return {
      accrue: false,
      skipReason: 'ambiguous_bands',
      ruleIds: matched.map((c) => c.rule.id),
    };
  }

  const win = matched.at(0);
  if (win == null) return { accrue: false, skipReason: 'no_matching_band' };
  return {
    accrue: true,
    ruleId: win.rule.id,
    ruleName: win.rule.name,
    kind: win.kind,
    amountMinor: win.rule.amountMinor,
    band: win.band,
  };
}

/** `[min, max)` — quyi chegara YOPIQ, yuqorisi OCHIQ. */
function inBand(score: number, band: AccrualBand): boolean {
  if (score < band.minPercent) return false;
  return band.maxPercent == null || score < band.maxPercent;
}

function parseKind(kind: string): BonusFineKind | null {
  return kind === 'bonus' || kind === 'fine' ? kind : null;
}

/**
 * `condition` Json'dan oraliq. Buzuq/begona shakl → `null` (qoida shu
 * kanalda qatnashmaydi). Bu yerda XATO TASHLANMAYDI: bitta noto'g'ri
 * qoida butun qabul qilishni to'xtatib qo'ysa, menejer ish qila olmasdi.
 */
export function parseBand(condition: unknown): AccrualBand | null {
  if (!isAccrualCondition(condition)) return null;
  const c = condition as Record<string, unknown>;

  const minPercent = c.minPercent;
  if (typeof minPercent !== 'number' || !Number.isFinite(minPercent) || minPercent < 0) return null;

  const raw = c.maxPercent;
  if (raw == null) return { minPercent, maxPercent: null };
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= minPercent) return null;
  return { minPercent, maxPercent: raw };
}

/**
 * Qoida shu kanalga DA'VOGARMI (`condition.type`). To'g'riligini
 * tekshirmaydi — `parseBand` shu ustiga qo'shimcha qiladi.
 */
export function isAccrualCondition(condition: unknown): boolean {
  if (condition == null || typeof condition !== 'object') return false;
  return (condition as Record<string, unknown>).type === KPI_ACCRUAL_CONDITION_TYPE;
}

/** Bekor qilishda yoziladigan teskari qator. */
export interface ReversalRow {
  kind: BonusFineKind;
  /** Manfiy — `aggregateRaw` uni o'z turidan AYIRADI, ya'ni sof qoldiq 0 bo'ladi. */
  amountMinor: bigint;
}

/**
 * Kun `accepted`/`force_accepted` dan CHIQQANDA yoziladigan qatorlar.
 *
 * Qoldiqdan hisoblanadi (o'chirish emas, oxirgi qatorni «topish» ham emas):
 * har tur bo'yicha sof yig'indi olinadi va u nolga keltiriladi. Shundan
 * ikki xosiyat bepul chiqadi:
 *   • **idempotentlik** — ikkinchi chaqiruvda qoldiq allaqachon 0, qator yo'q
 *     (aks holda bekor qilish pulni «tiklab» yuborardi);
 *   • **ko'p siklga chidamlilik** — qabul → bekor → qabul ketma-ketligida
 *     faqat joriy qoldiq teskarilanadi, tarix esa buzilmaydi.
 */
export function planReversalRows(
  rows: ReadonlyArray<{ kind: string; amountMinor: bigint }>,
): ReversalRow[] {
  const net = new Map<BonusFineKind, bigint>();
  for (const r of rows) {
    const kind = parseKind(r.kind);
    if (kind == null) continue;
    net.set(kind, (net.get(kind) ?? 0n) + r.amountMinor);
  }
  const out: ReversalRow[] = [];
  // Tartib qat'iy ('bonus' → 'fine'): test va jurnal o'qilishi barqaror bo'lsin.
  for (const kind of ['bonus', 'fine'] as const) {
    const sum = net.get(kind);
    if (sum != null && sum !== 0n) out.push({ kind, amountMinor: -sum });
  }
  return out;
}
