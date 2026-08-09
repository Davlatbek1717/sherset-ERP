/**
 * MK21 — «Qaror jurnali» sof qatlami (4M TZ §8.1/8).
 *
 * **Yangi jadval ochilmaydi.** Bu modul to'rtta MAVJUD append-only hodisa
 * jurnalini bitta ko'rinishga qo'shadi:
 *
 *   · `EmployeeDailyKpiEvent`          — kunlik KPI qabuli (MK01/MK02)
 *   · `ManagerWorkItemEvent`           — menejer ish navbati (MK06/MK07)
 *   · `CashierSessionAcceptanceEvent`  — smena yakunini qabul qilish (MK08)
 *   · `SupplyApprovalEvent`            — qabul tasdiqlash zanjiri
 *
 * Savol har birida bir xil: **kim · qachon · nima qaror qildi · sababi ·
 * natijasi**. Manbalar turlicha atalgani uchun (state/status/stage) bu yerda
 * bitta tilga keltiriladi va faqat SHU yerda tartiblanadi/filtrlanadi —
 * I/O qatlami (`decision-journal.service.ts`) hech qanday qoida saqlamaydi.
 */

export const DECISION_SOURCE = {
  dailyKpi: 'daily_kpi',
  workItem: 'work_item',
  shift: 'shift',
  supply: 'supply',
} as const;

export type DecisionSource = (typeof DECISION_SOURCE)[keyof typeof DECISION_SOURCE];
export const DECISION_SOURCES = Object.values(DECISION_SOURCE) as DecisionSource[];

/**
 * Qarorni BEKOR QILUVCHI amallar. Har uchala qabul-FSM'ida bu `reopen`:
 * element yopiq holatdan yana `pending` ga qaytadi, ya'ni oldingi qarorning
 * KUCHI qolmaydi.
 *
 * `supply` ataylab bo'sh — qabul zanjirida teskari amal yo'q (rad etish
 * OLDINGI tasdiqni bekor qilmaydi, u zanjirning keyingi qarori).
 */
const VOIDING_ACTIONS: Record<DecisionSource, ReadonlySet<string>> = {
  [DECISION_SOURCE.dailyKpi]: new Set(['reopen']),
  [DECISION_SOURCE.workItem]: new Set(['reopen']),
  [DECISION_SOURCE.shift]: new Set(['reopen']),
  [DECISION_SOURCE.supply]: new Set(),
};

/**
 * Qaysi qarorlarning kuchi qayta ochish bilan yo'qoladi.
 *
 * ⚠️ `adjust` (KPI ko'rsatkich tuzatmasi) ATAYLAB ro'yxatda yo'q: qayta ochish
 * holатni qaytaradi, lekin tuzatilgan raqamni tiklamaydi — uni «bekor
 * qilingan» deb belgilash YOLG'ON bo'lardi.
 */
const VOIDABLE_ACTIONS: Record<DecisionSource, ReadonlySet<string>> = {
  [DECISION_SOURCE.dailyKpi]: new Set(['accept', 'force_accept', 'reject']),
  [DECISION_SOURCE.workItem]: new Set([
    'acknowledge',
    'record_fine',
    'dismiss',
    'escalate',
    'write_warning',
  ]),
  [DECISION_SOURCE.shift]: new Set(['accept', 'force_accept', 'reject']),
  [DECISION_SOURCE.supply]: new Set(),
};

/** Jurnalga PUL izi (MK01) — `HrBonusFineLog` dagi bir qator. */
export interface DecisionMoney {
  /** `bonus` | `fine` — manbadagi qiymat o'zgarishsiz. */
  kind: string;
  /** Tiyin. Teskari (bekor qilish) yozuvi MANFIY bo'ladi. */
  amountMinor: bigint;
}

/** I/O qatlami normallashtirib beradigan bitta hodisa. */
export interface DecisionEventInput {
  source: DecisionSource;
  eventId: string;
  occurredAt: Date;
  action: string;
  fromState: string;
  toState: string;
  /** `system` — dvigatel; qolgani odam roli (manager/owner/employee/cashier/…). */
  actorType: string;
  actorId: string | null;
  /** `null` = ism topilmadi (xodim o'chgan). «Tizim» deb yozilmaydi. */
  actorName: string | null;
  /** Qaror TEGISHLI bo'lgan birlik (kun kartasi, navbat elementi, smena, qabul). */
  subjectId: string;
  subjectLabel: string;
  /** Qaror kimning ishiga tegishli — filtr uchun (aktyor bilan aralashmaydi). */
  subjectEmployeeId?: string | null;
  /** `null` = xodimga bog'lanmagan qaror yoki ism topilmadi. */
  subjectEmployeeName?: string | null;
  reasonCode: string | null;
  comment: string | null;
  money?: DecisionMoney[];
}

export interface DecisionRow
  extends Omit<DecisionEventInput, 'money' | 'subjectEmployeeId' | 'subjectEmployeeName'> {
  /** `${source}:${eventId}` — barqaror kalit (FE ro'yxati va CSV). */
  key: string;
  subjectEmployeeId: string | null;
  subjectEmployeeName: string | null;
  money: DecisionMoney[];
  /** Keyinchalik qayta ochilgan ⇒ qarorning kuchi qolmagan. Qator O'CHMAYDI. */
  voided: boolean;
  voidedByKey: string | null;
}

export interface DecisionFilter {
  /** Kiradi. */
  from?: Date;
  /** KIRMAYDI (yarim-ochiq oraliq) — kun chegarasida ikki karra sanash bo'lmasin. */
  to?: Date;
  sources?: DecisionSource[];
  /** Qarorni QABUL QILGAN. */
  actorId?: string;
  /** Qaror TEGISHLI bo'lgan xodim. */
  subjectEmployeeId?: string;
  action?: string;
  reasonCode?: string;
  /** Sukut bo'yicha `false` — tizim hodisalari qaror EMAS, lekin soni ko'rinadi. */
  includeSystem?: boolean;
  limit: number;
}

export interface DecisionJournal {
  rows: DecisionRow[];
  /** Kesishdan OLDINGI son — «nechtasi bor». */
  totalCount: number;
  truncated: boolean;
  /** Filtrga tushgan, lekin tizim hodisasi bo'lgani uchun ko'rsatilmaganlar. */
  hiddenSystemCount: number;
  summary: {
    bySource: Array<{ source: DecisionSource; count: number }>;
    byAction: Array<{ action: string; count: number }>;
    voidedCount: number;
  };
  /**
   * Tanlagichlar uchun ro'yxatlar — davr/manba oynasidagi HAMMA qiymat,
   * `actorId`/`action`/`reasonCode` filtrlari QO'LLANMAGAN holda.
   *
   * Sabab: agar variantlar filtrlangan natijadan qurilsa, bir marta aktyor
   * tanlangandan keyin ro'yxatda faqat o'sha aktyor qolardi va boshqasiga
   * o'tib bo'lmasdi — filtr o'zini o'zi qulflab qo'yardi.
   */
  facets: {
    actors: Array<{ actorId: string | null; actorName: string | null; count: number }>;
    actions: Array<{ action: string; count: number }>;
    reasons: Array<{ reasonCode: string; count: number }>;
  };
}

/**
 * Hodisalarni bitta jurnalga qo'shadi.
 *
 * ⚠️ **Bekor qilish belgisi filtrdan OLDIN hisoblanadi.** Aks holda ikki
 * yolg'on chiqardi: (a) `action=accept` filtri qayta ochish hodisasini kesib
 * tashlar va bekor qilingan qaror «kuchda» ko'rinardi; (b) davr oynasidan
 * keyin bo'lgan qayta ochish ko'rinmay qolardi. Shuning uchun I/O qatlami
 * oynadan KEYINGI bekor qiluvchi hodisalarni ham uzatadi — ular qator sifatida
 * chiqmaydi (oyna filtri kesadi), lekin belgi qo'yadi.
 */
export function buildDecisionJournal(
  events: readonly DecisionEventInput[],
  filter: DecisionFilter,
): DecisionJournal {
  const voidedBy = computeVoiding(events);

  const all: DecisionRow[] = events.map((e) => ({
    ...e,
    key: keyOf(e.source, e.eventId),
    subjectEmployeeId: e.subjectEmployeeId ?? null,
    subjectEmployeeName: e.subjectEmployeeName ?? null,
    money: e.money ?? [],
    voided: voidedBy.has(keyOf(e.source, e.eventId)),
    voidedByKey: voidedBy.get(keyOf(e.source, e.eventId)) ?? null,
  }));

  // Tanlagich variantlari — «tor» filtrlarsiz asos to'plamdan.
  const base = all.filter((r) =>
    matches(r, {
      ...filter,
      actorId: undefined,
      action: undefined,
      reasonCode: undefined,
      subjectEmployeeId: undefined,
    }),
  );

  const matched = all.filter((r) => matches(r, filter));
  // Tizim hodisalari — QAROR emas, lekin soni ochiq aytiladi (jimgina
  // yo'qolgan qator «hech narsa bo'lmagan» degan taassurot qoldiradi).
  const hiddenSystemCount = filter.includeSystem
    ? 0
    : matched.filter((r) => r.actorType === 'system').length;
  const visible = filter.includeSystem ? matched : matched.filter((r) => r.actorType !== 'system');

  visible.sort(compareRows);

  const totalCount = visible.length;
  const truncated = totalCount > filter.limit;
  const rows = truncated ? visible.slice(0, filter.limit) : visible;

  return {
    rows,
    totalCount,
    truncated,
    hiddenSystemCount,
    // Jamlar KESILGANDAN KEYINGI qatorlar bo'yicha — ekrandagi raqam ekrandagi
    // qatorlarni tavsiflaydi (MK16 dagi bir xil qaror).
    summary: {
      bySource: countBy(rows, (r) => r.source).map(([source, count]) => ({
        source: source as DecisionSource,
        count,
      })),
      byAction: countBy(rows, (r) => r.action).map(([action, count]) => ({ action, count })),
      voidedCount: rows.filter((r) => r.voided).length,
    },
    facets: buildFacets(filter.includeSystem ? base : base.filter((r) => r.actorType !== 'system')),
  };
}

/** Tanlagich ro'yxatlari — eng ko'p uchragani tepada, keyin alifbo (determinizm). */
function buildFacets(rows: readonly DecisionRow[]): DecisionJournal['facets'] {
  const actors = new Map<
    string,
    { actorId: string | null; actorName: string | null; count: number }
  >();
  for (const r of rows) {
    const k = r.actorId ?? '';
    const found = actors.get(k);
    if (found) found.count += 1;
    else actors.set(k, { actorId: r.actorId, actorName: r.actorName, count: 1 });
  }

  return {
    actors: [...actors.values()].sort(
      (a, b) =>
        b.count - a.count || cmp(a.actorName ?? a.actorId ?? '', b.actorName ?? b.actorId ?? ''),
    ),
    actions: countBy(rows, (r) => r.action).map(([action, count]) => ({ action, count })),
    reasons: countBy(
      rows.filter((r) => r.reasonCode),
      (r) => r.reasonCode as string,
    ).map(([reasonCode, count]) => ({ reasonCode, count })),
  };
}

/** `${source}:${eventId}` — manbalararo to'qnashmaydigan kalit. */
export function keyOf(source: DecisionSource, eventId: string): string {
  return `${source}:${eventId}`;
}

/**
 * Har bir bekor qilingan qaror uchun uni bekor qilgan hodisa kaliti.
 *
 * Qoida: sub'ekt bo'yicha KEYINGI bekor qiluvchi hodisa bo'lsa, undan oldingi
 * «bekor qilinuvchi» qarorlar kuchini yo'qotadi. Bir nechta sikl bo'lsa
 * (qabul → qayta ochish → qabul → qayta ochish) har qaror O'ZIDAN keyingi ENG
 * YAQIN qayta ochish bilan belgilanadi.
 */
function computeVoiding(events: readonly DecisionEventInput[]): Map<string, string> {
  const out = new Map<string, string>();

  const bySubject = new Map<string, DecisionEventInput[]>();
  for (const e of events) {
    const k = `${e.source} ${e.subjectId}`;
    const list = bySubject.get(k);
    if (list) list.push(e);
    else bySubject.set(k, [e]);
  }

  for (const list of bySubject.values()) {
    const ordered = [...list].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || cmp(a.eventId, b.eventId),
    );
    for (let i = 0; i < ordered.length; i++) {
      const e = ordered[i] as DecisionEventInput;
      if (!VOIDABLE_ACTIONS[e.source].has(e.action)) continue;
      for (let j = i + 1; j < ordered.length; j++) {
        const later = ordered[j] as DecisionEventInput;
        if (VOIDING_ACTIONS[e.source].has(later.action)) {
          out.set(keyOf(e.source, e.eventId), keyOf(later.source, later.eventId));
          break;
        }
      }
    }
  }

  return out;
}

function matches(row: DecisionRow, f: DecisionFilter): boolean {
  if (f.from && row.occurredAt.getTime() < f.from.getTime()) return false;
  if (f.to && row.occurredAt.getTime() >= f.to.getTime()) return false;
  if (f.sources && f.sources.length > 0 && !f.sources.includes(row.source)) return false;
  if (f.actorId && row.actorId !== f.actorId) return false;
  if (f.subjectEmployeeId && row.subjectEmployeeId !== f.subjectEmployeeId) return false;
  if (f.action && row.action !== f.action) return false;
  if (f.reasonCode && row.reasonCode !== f.reasonCode) return false;
  return true;
}

/** Eng yangisi tepada; teng vaqtda — manba, keyin id (determinizm). */
function compareRows(a: DecisionRow, b: DecisionRow): number {
  return (
    b.occurredAt.getTime() - a.occurredAt.getTime() ||
    cmp(a.source, b.source) ||
    cmp(a.eventId, b.eventId)
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Guruh sanog'i — kalit bo'yicha barqaror (alifbo) tartibda. */
function countBy<T>(rows: readonly T[], pick: (r: T) => string): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((x, y) => cmp(x[0], y[0]));
}
