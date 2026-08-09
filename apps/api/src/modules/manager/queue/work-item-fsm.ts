/**
 * MK06 / 4M TZ §5.3–§5.4 — NAVBAT ELEMENTI USTIDAGI HARAKATLAR.
 *
 * Umumiy dvigatel ustida (`shared/acceptance-fsm.ts`) — MK08 aynan shu
 * naqshni nusxa ko'chirmaslik uchun ajratgan edi. Bu yerda faqat JADVAL
 * turadi: qoida bitta joyda, obyektlar ko'p.
 *
 * ## §5.3 — sababsiz yopilgan navbat statistikasiz navbat
 * YOPUVCHI har o'tish `reasonRequired: true` va yopiq sabab ro'yxatiga ega.
 * Test jadval bo'ylab yuradi, ya'ni MK07 yangi yopuvchi amal qo'shsa ham
 * qoida buzilmaydi (unutilgan `reasonRequired: false` testni yiqitadi).
 *
 * ## Eskirish bu yerda YO'Q
 * `staleAt` — BAYROQ, status emas (`work-queue-planner.ts` qo'yadi). Jurnalga
 * u `mark_stale` hodisasi sifatida tushadi, lekin holatni O'ZGARTIRMAYDI,
 * shuning uchun FSM amali emas.
 */

import {
  type AcceptanceFsm,
  type AcceptanceTransition,
  createAcceptanceFsm,
} from '../../shared/acceptance-fsm.js';
import type { ManagerRuleType } from './work-item-rules.js';

export const WORK_ITEM_STATUS = {
  /** Hech kim tegmagan. */
  open: 'open',
  /** Menejer ish boshlagan (tushuntirish so'radi / tekshiruv ochdi / vazifa berdi). */
  inReview: 'in_review',
  /** Ko'rildi va yopildi. */
  resolved: 'resolved',
  /** Element o'rinsiz edi (noto'g'ri qoida, dublikat). */
  dismissed: 'dismissed',
  /** Menejer o'zi hal qila olmadi — egada. */
  escalated: 'escalated',
} as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUS)[keyof typeof WORK_ITEM_STATUS];

/** Yopilgan holatlar — bulardan keyin faqat `reopen`. */
export const CLOSED_WORK_ITEM_STATUSES: ReadonlySet<WorkItemStatus> = new Set([
  WORK_ITEM_STATUS.resolved,
  WORK_ITEM_STATUS.dismissed,
  WORK_ITEM_STATUS.escalated,
]);

export const WORK_ITEM_ACTION = {
  /** §5.4/1 — tasdiqlash: «ko'rdim, hammasi o'rinli». */
  acknowledge: 'acknowledge',
  /** §5.4/2 — tushuntirish so'rash (xodimga savol). */
  requestExplanation: 'request_explanation',
  /** §5.4/3 — jarima yozish. */
  recordFine: 'record_fine',
  /** §5.4/4 — tekshiruv boshlash. */
  startInvestigation: 'start_investigation',
  /** §5.4 kengaytmasi — vazifa berish. */
  assignTask: 'assign_task',
  /** §5.4 kengaytmasi — ogohlantirish yozish. */
  writeWarning: 'write_warning',
  /** §5.4 kengaytmasi — egaga eskalatsiya. */
  escalate: 'escalate',
  /** Element o'rinsiz — yopiladi, lekin «tasdiqlandi» EMAS. */
  dismiss: 'dismiss',
  /** Yopilgan elementni qaytarish. */
  reopen: 'reopen',
} as const;

export type WorkItemAction = (typeof WORK_ITEM_ACTION)[keyof typeof WORK_ITEM_ACTION];

export const WORK_ITEM_ACTOR = {
  /** Dvigatel — eskirish belgisi (holat o'zgarmaydi, faqat jurnal). */
  system: 'system',
  manager: 'manager',
  owner: 'owner',
} as const;

export type WorkItemActor = (typeof WORK_ITEM_ACTOR)[keyof typeof WORK_ITEM_ACTOR];

/**
 * Sabab kodlari — **QARORNING turi** haqida: menejer nima qildi (tasdiqladi /
 * jarima yozdi / o'rinsiz deb yopdi / yuqoriga uzatdi). Har amal uchun yopiq
 * ro'yxat.
 *
 * Hodisa NEGA bo'lgani bu yerda EMAS — u qoidaga bog'liq va `RULE_REASON_CODES`
 * da turadi (MK07, §5.3).
 */
export const WORK_ITEM_REASON_CODES = {
  [WORK_ITEM_ACTION.acknowledge]: ['justified', 'corrected', 'no_action_needed', 'other'],
  [WORK_ITEM_ACTION.recordFine]: ['policy_violation', 'repeated_violation', 'other'],
  [WORK_ITEM_ACTION.dismiss]: ['false_positive', 'rule_misconfigured', 'duplicate', 'other'],
  [WORK_ITEM_ACTION.escalate]: ['beyond_authority', 'systemic_issue', 'other'],
  [WORK_ITEM_ACTION.reopen]: ['new_evidence', 'closed_by_mistake', 'other'],
} as const satisfies Partial<Record<WorkItemAction, readonly string[]>>;

const OPEN_STATES = [WORK_ITEM_STATUS.open, WORK_ITEM_STATUS.inReview] as const;

/**
 * «Ish boshlandi» amallari — holatni `in_review` ga suradi va HAR SAFAR yangi
 * hodisa (idempotent EMAS): ikkinchi tushuntirish so'rovi ikkinchi savol,
 * takror bosish emas.
 */
const WORKING_ACTIONS = [
  WORK_ITEM_ACTION.requestExplanation,
  WORK_ITEM_ACTION.startInvestigation,
  WORK_ITEM_ACTION.assignTask,
  WORK_ITEM_ACTION.writeWarning,
] as const;

type WorkItemTransition = AcceptanceTransition<WorkItemStatus, WorkItemAction, WorkItemActor>;

export const WORK_ITEM_TRANSITIONS: readonly WorkItemTransition[] = [
  ...WORKING_ACTIONS.map(
    (action): WorkItemTransition => ({
      action,
      from: OPEN_STATES,
      to: WORK_ITEM_STATUS.inReview,
      actors: [WORK_ITEM_ACTOR.manager, WORK_ITEM_ACTOR.owner],
      reasonRequired: false,
      idempotent: false,
    }),
  ),
  {
    action: WORK_ITEM_ACTION.acknowledge,
    from: OPEN_STATES,
    to: WORK_ITEM_STATUS.resolved,
    actors: [WORK_ITEM_ACTOR.manager, WORK_ITEM_ACTOR.owner],
    reasonRequired: true,
    idempotent: true,
  },
  {
    action: WORK_ITEM_ACTION.recordFine,
    from: OPEN_STATES,
    to: WORK_ITEM_STATUS.resolved,
    actors: [WORK_ITEM_ACTOR.manager, WORK_ITEM_ACTOR.owner],
    reasonRequired: true,
    // Takror bosish jarimani IKKI MARTA yozmasligi uchun (pul yozadigan
    // o'tishda idempotentlik majburiy — MK01 sabog'i).
    idempotent: true,
  },
  {
    action: WORK_ITEM_ACTION.dismiss,
    from: OPEN_STATES,
    to: WORK_ITEM_STATUS.dismissed,
    actors: [WORK_ITEM_ACTOR.manager, WORK_ITEM_ACTOR.owner],
    reasonRequired: true,
    idempotent: true,
  },
  {
    action: WORK_ITEM_ACTION.escalate,
    from: OPEN_STATES,
    to: WORK_ITEM_STATUS.escalated,
    // Ega o'ziga eskalatsiya qila olmaydi — bu amalning ma'nosi «yuqoriga».
    actors: [WORK_ITEM_ACTOR.manager],
    reasonRequired: true,
    idempotent: true,
  },
  {
    action: WORK_ITEM_ACTION.reopen,
    from: [...CLOSED_WORK_ITEM_STATUSES],
    to: WORK_ITEM_STATUS.open,
    actors: [WORK_ITEM_ACTOR.manager, WORK_ITEM_ACTOR.owner],
    reasonRequired: true,
    // Qayta ochish har safar YANGI hodisa (MK08 dagi bilan bir xil qoida).
    idempotent: false,
  },
];

export const workItemFsm = createAcceptanceFsm<WorkItemStatus, WorkItemAction, WorkItemActor>({
  transitions: WORK_ITEM_TRANSITIONS,
  reasonCodes: WORK_ITEM_REASON_CODES,
});

// ── MK07 / §5.3 — SABAB kodlari (qoidaga bog'langan) ────────────────────────

/**
 * Har qoida turi uchun «NEGA bunday bo'ldi» kodlari.
 *
 * TZ §5.3 shuni kutadi: *«zararga sotuvlarning 30% — raqobatchi narxi, 20% —
 * muddati o'tayotgan tovar»*. Umumiy `justified` bunday hisobot bermaydi — u
 * qaror o'rinli ekanini yozadi, sababini emas.
 *
 * Tip **to'liq** `Record` (`Partial` emas): registrga yangi qoida qo'shilib,
 * sabab kodlari unutilsa — typecheck yiqiladi. Aks holda o'sha qoida jimgina
 * statistikasiz qolardi va buni hech kim sezmasdi.
 */
export const RULE_REASON_CODES = {
  PRICE_CHANGE: ['supplier_price_up', 'promo_campaign', 'price_typo_fixed'],
  CASH_VARIANCE: ['counting_error', 'unrecorded_expense', 'change_shortage', 'covered_by_cashier'],

  BELOW_COST: ['competitor_price', 'expiring_goods', 'clearance', 'cost_data_wrong'],
  BIG_DISCOUNT: ['regular_customer', 'bulk_deal', 'damaged_goods', 'manager_approved'],
  BELOW_WHOLESALE: ['contract_price', 'bulk_deal', 'competitor_price'],

  BIG_DEBT: ['credit_limit_agreed', 'payment_scheduled', 'long_term_partner'],
  OVERDUE_DEBT: ['payment_promised', 'debt_disputed', 'unreachable', 'writeoff_requested'],

  LATE: ['transport_delay', 'health_issue', 'permitted_by_manager'],
  ABSENT: ['sick_leave', 'vacation', 'permitted_by_manager', 'unexcused'],
  SHIFT_OUT_OF_SCHEDULE: ['schedule_swap', 'urgent_order', 'schedule_data_wrong'],

  LOW_STOCK: ['reorder_placed', 'discontinued_item', 'seasonal_dip'],
  DEAD_STOCK: ['discount_planned', 'return_to_supplier', 'writeoff_planned'],
  PICKING_SLA: ['staff_shortage', 'goods_not_found', 'customer_postponed'],
  INVENTORY_VARIANCE: ['recount_error', 'theft_suspected', 'damage_writeoff', 'document_missing'],
} as const satisfies Record<ManagerRuleType, readonly string[]>;

/**
 * Qoida kodlari FAQAT `acknowledge` ga qo'shiladi.
 *
 * Nega boshqa yopuvchi amallarga emas: `dismiss` = «signal noto'g'ri edi»,
 * `record_fine` = «jazoladim», `escalate` = «vakolatimdan tashqari». Bular
 * QARORNI tavsiflaydi. Hodisa nega bo'lgani esa faqat «ko'rdim, o'rinli»
 * yo'lida ma'noli — aralashtirilsa «raqobatchi narxi tufayli DUBLIKAT» kabi
 * ma'nosiz juftliklar paydo bo'lardi va statistika buzilardi.
 */
const CAUSE_ACTION = WORK_ITEM_ACTION.acknowledge;

const fsmByRule = new Map<string, AcceptanceFsm<WorkItemStatus, WorkItemAction, WorkItemActor>>();

/**
 * Qoidaga moslangan FSM. `null`/notanish tur — umumiy FSM (regressiyasiz:
 * MK06 dagi xulq o'zgarmaydi).
 */
export function workItemFsmFor(
  ruleType: string | null | undefined,
): AcceptanceFsm<WorkItemStatus, WorkItemAction, WorkItemActor> {
  if (!ruleType) return workItemFsm;

  const extra = (RULE_REASON_CODES as Record<string, readonly string[] | undefined>)[ruleType];
  if (!extra?.length) return workItemFsm;

  const cached = fsmByRule.get(ruleType);
  if (cached) return cached;

  const generic = WORK_ITEM_REASON_CODES[CAUSE_ACTION];
  const fsm = createAcceptanceFsm<WorkItemStatus, WorkItemAction, WorkItemActor>({
    transitions: WORK_ITEM_TRANSITIONS,
    reasonCodes: {
      ...WORK_ITEM_REASON_CODES,
      // `other` — oxirida: tanlagichda «qochish yo'li» eng pastda tursin,
      // aks holda hamma uni birinchi ko'rib bosadi va statistika o'ladi.
      [CAUSE_ACTION]: [...generic.filter((c) => c !== 'other'), ...extra, 'other'],
    },
  });
  fsmByRule.set(ruleType, fsm);
  return fsm;
}

/**
 * Amal → ruxsat etilgan sabab kodlari, shu qoida uchun. Ekrandagi tanlagich
 * AYNAN shundan chiziladi — FE o'z nusxasini saqlamaydi (ikki ro'yxat bir
 * kunda ajraladi va menejer tanlagan kod 400 bilan qaytardi).
 */
export function reasonCatalogFor(
  ruleType: string | null | undefined,
): Record<string, readonly string[]> {
  const fsm = workItemFsmFor(ruleType);
  const out: Record<string, readonly string[]> = {};
  for (const action of Object.keys(WORK_ITEM_REASON_CODES) as WorkItemAction[]) {
    out[action] = fsm.reasonCodesFor(action);
  }
  return out;
}

/**
 * Jurnalga tushadigan, lekin holatni o'zgartirmaydigan hodisa — eskirish
 * belgisi. FSM amali EMAS (yuqoridagi izoh), shuning uchun alohida konstanta.
 */
export const WORK_ITEM_JOURNAL_ONLY_ACTION = { markStale: 'mark_stale' } as const;
