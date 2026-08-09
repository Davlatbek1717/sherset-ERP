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

import { type AcceptanceTransition, createAcceptanceFsm } from '../../shared/acceptance-fsm.js';

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
 * Sabab kodlari — MK06 uchun MINIMAL to'plam. **MK07** (§5.3) buni qoida
 * turlariga bog'lab kengaytiradi; shakl o'zgarmaydi.
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

/**
 * Jurnalga tushadigan, lekin holatni o'zgartirmaydigan hodisa — eskirish
 * belgisi. FSM amali EMAS (yuqoridagi izoh), shuning uchun alohida konstanta.
 */
export const WORK_ITEM_JOURNAL_ONLY_ACTION = { markStale: 'mark_stale' } as const;
