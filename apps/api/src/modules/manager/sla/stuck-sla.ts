/**
 * MK10 / 4M TZ §8 — «NIMA QOTIB QOLGAN» va SLA paneli. Sof modul (Prisma'siz).
 *
 * Savol: *jarayonning qaysi bosqichida ish turib qoldi va qancha vaqtdan
 * beri*. Bu MK06 navbatidan BOSHQA savol: navbat «qoida buzildi» hodisalarini
 * yig'adi (bo'lib o'tgan fakt), bu panel esa **hali bo'lmagan ish**ni —
 * yig'ilmagan buyurtma, qabul qilinmagan yetkazma, javobsiz da'vo, yopilmagan
 * smena, tasdiqlanmagan hujjat — yoshi bo'yicha ko'rsatadi.
 *
 * Shu sabab bu yerda hech narsa SAQLANMAYDI: qotib qolish holati manba
 * jadvallarning o'zida turibdi (`pickState`, `approvalStage`, `status`,
 * `state`), uni ikkinchi marta yozib qo'yish ikki haqiqat bo'lardi va sinxron
 * qolmasdi. Panel har so'rovda jonli hisoblanadi.
 *
 * ## 🔴 PANEL HECH NARSANI BLOKLAMAYDI (§5.1)
 * Har bosqich ta'rifida `blocks: false` **literal tipi** turadi — MK06 dagi
 * bilan bir xil qulf. SLA oshgani hujjatni to'xtatmaydi, faqat ko'rinadi.
 *
 * ## Chegara SOZLAMADA, kodda emas (MK10 DoD)
 * Chegaralar `manager_rule_configs` da `SLA_*` kalitlari bilan yashaydi — MK06
 * qoidalari bilan bir jadval, lekin kesishmaydigan nom fazosi. Yangi jadval
 * ochilmadi: ustunlar (`enabled`, `thresholdValue`, `thresholdUnit`,
 * `severity`) aynan kerak bo'lgan shakl, migratsiya esa umumiy resurs
 * (CLAUDE.md §6.4).
 *
 * ## Birlik chegaradan AJRALMAYDI
 * `thresholdValue` `thresholdUnit` siz o'qilmaydi (MK06 sabog'i: «20%» ni «20
 * tiyin» deb talqin qilish chegarani nolga tushirardi). Bu yerda faqat VAQT
 * birliklari qabul qilinadi: `hours` va `days` (24× — aniq o'girish).
 * Boshqasi RAD etiladi va `thresholdRejected: true` bilan ekranda ko'rinadi.
 */

import { SHIFT_LONG_HOURS } from '../live/live-status.js';
import {
  type RuleConfigRow,
  WORK_ITEM_SEVERITY,
  type WorkItemSeverity,
} from '../queue/work-item-rules.js';

/**
 * SLA chegarasi uchun qabul qilinadigan birliklar — MK06 `THRESHOLD_UNIT`
 * ro'yxatining VAQT qismi. Bu yerda ataylab TAKRORLANGAN, chunki qolgan
 * birliklar (`percent`, `minor`, `qty`) SLA uchun ma'nosiz: ularni qabul
 * qiladigan tip panelga «20% soat» kabi sozlama kirishiga yo'l ochardi.
 * `days` qiymati MK06 dagi bilan bir xil satr — bitta sozlama jadvali.
 */
export const SLA_THRESHOLD_UNIT = { hours: 'hours', days: 'days' } as const;
export type SlaThresholdUnit = (typeof SLA_THRESHOLD_UNIT)[keyof typeof SLA_THRESHOLD_UNIT];

// ── Bosqichlar ──────────────────────────────────────────────────────────────

export const SLA_STAGE = {
  /** Buyurtma keldi — omborchi hali yig'ib bermadi. */
  orderPicking: 'ORDER_PICKING',
  /** Yetkazma tasdiq zanjirida turib qoldi (taminotchi→omborchi→admin). */
  supplyAcceptance: 'SUPPLY_ACCEPTANCE',
  /** Mijoz da'vosi/murojaati javobsiz. */
  claimResponse: 'CLAIM_RESPONSE',
  /** Kassa smenasi ochiq qolgan — pul javobgarligi cho'zilmoqda. */
  shiftClose: 'SHIFT_CLOSE',
  /** Hujjat qoralamada — o'tkazilmagan, ya'ni qoldiq/pulga ta'sir qilmagan. */
  docApproval: 'DOC_APPROVAL',
} as const;

export type SlaStage = (typeof SLA_STAGE)[keyof typeof SLA_STAGE];

/** Sozlama kaliti — `manager_rule_configs.rule_type` (VarChar(40)). */
export function slaRuleType(stage: SlaStage): string {
  return `SLA_${stage}`;
}

export interface SlaStageDefinition {
  readonly stage: SlaStage;
  readonly ruleType: string;
  readonly defaultEnabled: boolean;
  /** Registr chegarasi — sozlama bo'lmasa shu amal qiladi. */
  readonly defaultThresholdHours: number;
  /** Har doim `hours`: panel yagona o'lchovda hisoblaydi. */
  readonly thresholdUnit: 'hours';
  readonly defaultSeverity: WorkItemSeverity;
  /** 🔴 Literal `false` — panel kuzatadi, to'xtatmaydi. */
  readonly blocks: false;
}

/**
 * Boshlang'ich chegaralar. Har biri «o'ylab topilgan raqam» bo'lmasligi uchun
 * izohlangan — sozlamadan o'zgartiriladi.
 */
export const SLA_STAGES = {
  /**
   * 4 soat: buyurtma yarim ish kunidan uzoq yig'ilmay tursa, mijozga
   * berilgan muddat allaqachon xavf ostida. `live-status.ts` dagi 45 daqiqa
   * BOSHQA o'lchov — u faqat yig'ish BOSHLANGANIDAN keyingi qotishni
   * kuzatadi; bu yerda umuman boshlanmagani ham hisobga olinadi.
   */
  ORDER_PICKING: {
    stage: SLA_STAGE.orderPicking,
    ruleType: 'SLA_ORDER_PICKING',
    defaultEnabled: true,
    defaultThresholdHours: 4,
    thresholdUnit: 'hours',
    defaultSeverity: WORK_ITEM_SEVERITY.warning,
    blocks: false,
  },
  /**
   * 24 soat: tasdiq zanjiri kunlik ritmda ishlaydi (taminotchi jo'natdi →
   * omborchi qabul qildi → admin tasdiqladi). Bir kundan uzog'i deyarli har
   * doim «kimdir unutdi» degani, va stock oshmagani uchun qoldiq YOLG'ON
   * bo'lib turadi.
   */
  SUPPLY_ACCEPTANCE: {
    stage: SLA_STAGE.supplyAcceptance,
    ruleType: 'SLA_SUPPLY_ACCEPTANCE',
    defaultEnabled: true,
    defaultThresholdHours: 24,
    thresholdUnit: 'hours',
    defaultSeverity: WORK_ITEM_SEVERITY.critical,
    blocks: false,
  },
  /**
   * 8 soat — bir ish kuni. Mijoz murojaatiga kun ichida javob berilmasa,
   * u qayta qo'ng'iroq qiladi yoki ketadi.
   *
   * ⚠️ `ServiceRequest.dueDate` (mijozga va'da qilingan muddat) MK10 da
   * ISHLATILMAYDI: panel «qancha vaqtdan beri qimirlamadi» ni o'lchaydi,
   * va'daga nisbatan kechikish esa boshqa ko'rsatkich. Ikkisini bitta
   * ustunda aralashtirish qaysi raqam nimani anglatishini yashirardi.
   */
  CLAIM_RESPONSE: {
    stage: SLA_STAGE.claimResponse,
    ruleType: 'SLA_CLAIM_RESPONSE',
    defaultEnabled: true,
    defaultThresholdHours: 8,
    thresholdUnit: 'hours',
    defaultSeverity: WORK_ITEM_SEVERITY.warning,
    blocks: false,
  },
  /**
   * Jonli holat ekranidagi AYNI chegara (`SHIFT_LONG_HOURS`) — ikkinchi
   * raqam kiritilmaydi: bir xil hodisa ikki ekranda turlicha «uzoq» deb
   * baholansa, menejer qaysi biriga ishonishni bilmaydi.
   */
  SHIFT_CLOSE: {
    stage: SLA_STAGE.shiftClose,
    ruleType: 'SLA_SHIFT_CLOSE',
    defaultEnabled: true,
    defaultThresholdHours: SHIFT_LONG_HOURS,
    thresholdUnit: 'hours',
    defaultSeverity: WORK_ITEM_SEVERITY.critical,
    blocks: false,
  },
  /**
   * 48 soat: qoralama hujjat pul/qoldiqqa ta'sir qilmaydi, ya'ni hisobotlar
   * jimgina kam ko'rsatadi. Ikki kun — «ertaga o'tkazaman» ning chegarasi.
   */
  DOC_APPROVAL: {
    stage: SLA_STAGE.docApproval,
    ruleType: 'SLA_DOC_APPROVAL',
    defaultEnabled: true,
    defaultThresholdHours: 48,
    thresholdUnit: 'hours',
    defaultSeverity: WORK_ITEM_SEVERITY.info,
    blocks: false,
  },
} as const satisfies Record<SlaStage, SlaStageDefinition>;

/**
 * Bosqichdagi **OCHIQ** holatlar — «qotib qolgan» deb sanaladigan yagona
 * ro'yxat.
 *
 * 🔴 Servis Prisma `where` bandini AYNAN shundan quradi (`manager-sla.service`
 * `STAGE_OPEN_STATES[...]` ni to'g'ridan-to'g'ri uzatadi), ya'ni yopilgan
 * ob'ekt umuman O'QILMAYDI. Ro'yxat ikki joyda takrorlansa, bir joyda yangi
 * holat qo'shilganda panel jimgina eskirardi.
 */
export const STAGE_OPEN_STATES: Record<SlaStage, readonly string[]> = {
  // `MsPickList.pickState`: new → picking → picked.
  [SLA_STAGE.orderPicking]: ['new', 'picking'],
  // `Supply.approvalStage`: none | awaiting_supplier | delivering |
  // awaiting_admin | completed. `none` = zanjir umuman ishlatilmagan hujjat —
  // u bu bosqichda emas (aks holda har oddiy qabul panelga tushardi).
  [SLA_STAGE.supplyAcceptance]: ['awaiting_supplier', 'delivering', 'awaiting_admin'],
  // `ServiceRequest.status`: new | in_progress | waiting_customer | resolved |
  // closed | cancelled.
  [SLA_STAGE.claimResponse]: ['new', 'in_progress', 'waiting_customer'],
  // `CashierSession.state`.
  [SLA_STAGE.shiftClose]: ['open'],
  // Hujjat `state`: draft | posted | cancelled.
  [SLA_STAGE.docApproval]: ['draft'],
};

export function isStageOpen(stage: SlaStage, state: string): boolean {
  return STAGE_OPEN_STATES[stage].includes(state);
}

// ── Sozlama birlashtirish ───────────────────────────────────────────────────

export interface ResolvedSlaStage extends SlaStageDefinition {
  enabled: boolean;
  /** Amaldagi chegara — sozlama yoki registr. */
  thresholdHours: number;
  severity: WorkItemSeverity;
  /**
   * Sozlamadagi chegara VAQT birligida bo'lmagani (yoki birliksiz) uchun
   * e'tiborsiz qoldi. Ekranda ko'rsatiladi: jim tushib qolgan sozlama
   * menejerni «men chegarani o'zgartirdim-ku» degan yolg'on ishonchda
   * qoldirardi.
   */
  thresholdRejected: boolean;
}

/** Faqat VAQT birliklari; qolgani chegarani buzadi. */
const HOURS_PER_UNIT: Record<string, number> = {
  [SLA_THRESHOLD_UNIT.hours]: 1,
  [SLA_THRESHOLD_UNIT.days]: 24,
};

function parseNumber(value: string | number | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asSeverity(value: string, fallback: WorkItemSeverity): WorkItemSeverity {
  return Object.hasOwn(WORK_ITEM_SEVERITY, value) ? (value as WorkItemSeverity) : fallback;
}

/**
 * Registr + akkаunt sozlamasi → amaldagi bosqichlar.
 *
 * Notanish `ruleType` (masalan MK06 ning `PRICE_CHANGE` i — ular BIR jadvalda
 * yashaydi) JIM tashlanadi.
 */
export function resolveSlaStages(
  rows: ReadonlyArray<RuleConfigRow>,
): Map<SlaStage, ResolvedSlaStage> {
  const byType = new Map<string, RuleConfigRow>();
  for (const row of rows) byType.set(row.ruleType, row);

  const out = new Map<SlaStage, ResolvedSlaStage>();

  for (const def of Object.values(SLA_STAGES) as SlaStageDefinition[]) {
    const row = byType.get(def.ruleType);
    if (!row) {
      out.set(def.stage, {
        ...def,
        enabled: def.defaultEnabled,
        thresholdHours: def.defaultThresholdHours,
        severity: def.defaultSeverity,
        thresholdRejected: false,
      });
      continue;
    }

    const configured = parseNumber(row.thresholdValue);
    const factor = row.thresholdUnit == null ? undefined : HOURS_PER_UNIT[row.thresholdUnit];
    // Birlik vaqt birligi bo'lmasa — raqamga TEGILMAYDI.
    const usable = configured != null && configured > 0 && factor != null;

    out.set(def.stage, {
      ...def,
      enabled: row.enabled,
      thresholdHours: usable ? configured * factor : def.defaultThresholdHours,
      severity: asSeverity(row.severity, def.defaultSeverity),
      thresholdRejected: configured != null && !usable,
    });
  }

  return out;
}

// ── Qotib qolgan ob'ekt ─────────────────────────────────────────────────────

/**
 * Manbadan o'qilgan OCHIQ ob'ekt. Hali «qotib qolgan» emas — yoshi chegara
 * bilan solishtirilgandan keyin hukm chiqadi.
 */
export interface StuckSubject {
  stage: SlaStage;
  /** Manba yozuvining `id` si — ekrandan hujjatga o'tish uchun. */
  refId: string;
  docType: string;
  docName: string;
  /**
   * Bosqich ichidagi xom holat (`picking`, `awaiting_admin`, …). Ekran matni
   * SERVERDA yopilmaydi (MK03 sabog'i: BE qaytargan o'zbekcha matn ru
   * interfeysda turib qolardi va i18n gate uni ko'rmasdi) — FE shu kalitni
   * tarjima qiladi.
   */
  stateKey: string;
  /** «Kim» — javobgar xodim. `null` = bog'lanmagan. */
  employeeId: string | null;
  employeeName: string | null;
  /** «Qachondan beri» — bosqichda turib qolgan payt. */
  since: Date;
  /** «Qancha» — tiyin. `null` = O'LCHANMADI (0 EMAS). */
  amountMinor: bigint | null;
  currency: string | null;
}

export interface StuckRow extends StuckSubject {
  /** Bosqichda turgan vaqt (soat). Manfiy bo'lmaydi. */
  ageHours: number;
  thresholdHours: number;
  /** Chegaradan qancha oshgani (soat) — har doim > 0. */
  overdueHours: number;
  severity: WorkItemSeverity;
}

export interface StuckStageSummary {
  stage: SlaStage;
  ruleType: string;
  enabled: boolean;
  thresholdHours: number;
  thresholdUnit: 'hours';
  thresholdRejected: boolean;
  severity: WorkItemSeverity;
  /** Bosqichdagi BARCHA ochiq ob'ekt (SLA ichidagilar ham). */
  total: number;
  /** Chegaradan oshganlar. */
  overdue: number;
  /** Eng yomon oshish. `null` = oshgani YO'Q (0 EMAS — MK09 shartnomasi). */
  worstOverdueHours: number | null;
  blocks: false;
}

export interface StuckBoard {
  stages: StuckStageSummary[];
  rows: StuckRow[];
  /** Kesishdan OLDINGI to'liq son. */
  overdueCount: number;
  truncated: boolean;
}

/** Ekranga bir marta chiqariladigan qatorlar shifti. */
export const DEFAULT_STUCK_ROW_LIMIT = 200;

const HOUR_MS = 3_600_000;

/**
 * Ochiq ob'ektlar + amaldagi chegaralar → SLA taxtasi.
 *
 * Tartib: eng ko'p oshib ketgani TEPADA (bosqichlar aralash). Menejer ekranni
 * yuqoridan o'qiydi va birinchi qatorda eng uzoq unutilgan ish turishi kerak;
 * bosqich bo'yicha guruhlash esa eng og'rituvchi qatorni ro'yxat o'rtasiga
 * ko'mib qo'yardi. Bosqich kesimi alohida — `stages` xulosasida.
 */
export function buildStuckBoard(
  subjects: ReadonlyArray<StuckSubject>,
  resolved: ReadonlyMap<SlaStage, ResolvedSlaStage>,
  now: Date,
  opts: { limit?: number } = {},
): StuckBoard {
  const limit = opts.limit ?? DEFAULT_STUCK_ROW_LIMIT;

  const totals = new Map<SlaStage, number>();
  const overdueByStage = new Map<SlaStage, number>();
  const worstByStage = new Map<SlaStage, number>();
  const rows: StuckRow[] = [];

  for (const subject of subjects) {
    totals.set(subject.stage, (totals.get(subject.stage) ?? 0) + 1);

    const stage = resolved.get(subject.stage);
    // O'chirilgan bosqich qator BERMAYDI — lekin jamida sanalgan (yuqorida),
    // ya'ni «o'chirib qo'yilgan» holat ekranda ko'rinib turadi.
    if (!stage || !stage.enabled) continue;

    const ageHours = Math.max(0, (now.getTime() - subject.since.getTime()) / HOUR_MS);
    const overdueHours = ageHours - stage.thresholdHours;
    // Qat'iy `>`: chegaraga TENG yosh hali buzilish emas.
    if (overdueHours <= 0) continue;

    overdueByStage.set(subject.stage, (overdueByStage.get(subject.stage) ?? 0) + 1);
    const worst = worstByStage.get(subject.stage);
    if (worst == null || overdueHours > worst) worstByStage.set(subject.stage, overdueHours);

    rows.push({
      ...subject,
      ageHours,
      thresholdHours: stage.thresholdHours,
      overdueHours,
      severity: stage.severity,
    });
  }

  // Eng ko'p oshgani tepada; tenglikda eskirog'i (kichik `since`) oldin.
  rows.sort((a, b) => {
    const byOverdue = b.overdueHours - a.overdueHours;
    if (byOverdue !== 0) return byOverdue;
    return a.since.getTime() - b.since.getTime();
  });

  const stages: StuckStageSummary[] = (Object.values(SLA_STAGES) as SlaStageDefinition[]).map(
    (def) => {
      const stage = resolved.get(def.stage);
      return {
        stage: def.stage,
        ruleType: def.ruleType,
        enabled: stage?.enabled ?? def.defaultEnabled,
        thresholdHours: stage?.thresholdHours ?? def.defaultThresholdHours,
        thresholdUnit: def.thresholdUnit,
        thresholdRejected: stage?.thresholdRejected ?? false,
        severity: stage?.severity ?? def.defaultSeverity,
        total: totals.get(def.stage) ?? 0,
        overdue: overdueByStage.get(def.stage) ?? 0,
        worstOverdueHours: worstByStage.get(def.stage) ?? null,
        blocks: def.blocks,
      };
    },
  );

  return {
    stages,
    rows: rows.slice(0, limit),
    overdueCount: rows.length,
    truncated: rows.length > limit,
  };
}
