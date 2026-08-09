/**
 * SMENA YAKUNINI QABUL QILISH — sof FSM (MK08, 4M TZ §6).
 *
 * Savol: kassir smenani yopdi, farq akti yozildi, Z-hisobot chiqdi — **kim
 * buni ko'rdi va rozi bo'ldi?** Bugungacha javob yo'q edi: `acknowledgedAt`
 * faqat FARQ AKTIni belgilardi, farqsiz smena esa hech kimning stolidan
 * o'tmasdi. Ya'ni «hammasi joyida» degan xulosa HECH KIM tomonidan
 * tasdiqlanmagan bo'lardi.
 *
 * ┌──────┐ open_for_review ┌─────────┐   accept   ┌──────────┐
 * │ open │────────────────>│ pending │───────────>│ accepted │
 * └──────┘  (smena yopildi)└─────────┘            └──────────┘
 *                            │    ↑                 │      │
 *                     reject │    │ explain         │      │ mark_stale
 *                     (sabab)↓    │ (KASSIR)        │      ↓
 *                       ┌──────────┐                │  ┌───────┐
 *                       │ rejected │                │  │ stale │
 *                       └──────────┘                │  └───────┘
 *                            │ escalate             │      │ accept
 *                            ↓ (N kun jim)          │      ↓
 *                      ┌───────────┐ force_accept ┌─────────────────┐
 *                      │ escalated │─────────────>│ force_accepted  │
 *                      └───────────┘   (egasi)    └─────────────────┘
 *
 * IKKI QOIDA:
 *   1. 🔴 **QABUL SUMMALARGA TEGMAYDI.** `closingCashMinor`, `expectedCash…`,
 *      `discrepancy…`, Z-hisobot maydonlari — HECH BIRI qabul yo'lida
 *      o'zgarmaydi. Qabul = DALILNI KO'RDIM degani, raqamni tuzatish emas.
 *      Raqam noto'g'ri bo'lsa yo'l bitta: rad etish → tushuntirish →
 *      (kerak bo'lsa) alohida tuzatuvchi hujjat. Aks holda menejer kamomadni
 *      «tuzatib» yopib qo'yardi va farq akti dalil bo'lishdan to'xtardi.
 *   2. **Qabul qilinmagan smena kassir ustida QOLADI** (`isAccountable`) —
 *      javobgarlik taxtasi shu funksiyani o'qiydi, o'z ro'yxatini yozmaydi.
 *
 * Qoida dvigateli — `shared/acceptance-fsm.ts` (kunlik KPI qabuli bilan
 * BITTA dvigatel). Bu yerda faqat SMENA jadvali.
 */

import {
  type AcceptanceFailure,
  type AcceptanceInput,
  type AcceptanceResult,
  type AcceptanceTransition,
  createAcceptanceFsm,
} from '../shared/acceptance-fsm.js';

// ── Holatlar ────────────────────────────────────────────────────────────────

export const SHIFT_ACCEPTANCE_STATE = {
  /** Smena hali ochiq — qabul mavzusi emas (javobgarlik `open_shift` da). */
  open: 'open',
  /** Smena yopildi, menejer qaroriga navbatda. */
  pending: 'pending',
  /** Menejer ko'rdi va rozi bo'ldi. */
  accepted: 'accepted',
  /** Menejer rad etdi — KASSIRDAN tushuntirish so'raldi. */
  rejected: 'rejected',
  /** Menejer hal qilmadi/qila olmadi — egasiga chiqdi. */
  escalated: 'escalated',
  /** Egasi majburiy yopdi (boshi berk ko'chadan chiqish klapani). */
  forceAccepted: 'force_accepted',
  /** Qabuldan KEYIN smena hujjatlari o'zgardi — qayta ko'rik kerak. */
  stale: 'stale',
} as const;

export type ShiftAcceptanceState =
  (typeof SHIFT_ACCEPTANCE_STATE)[keyof typeof SHIFT_ACCEPTANCE_STATE];

export const SHIFT_ACCEPTANCE_STATES = Object.values(
  SHIFT_ACCEPTANCE_STATE,
) as ShiftAcceptanceState[];

// ── Amallar ─────────────────────────────────────────────────────────────────

export const SHIFT_ACCEPTANCE_ACTION = {
  openForReview: 'open_for_review',
  accept: 'accept',
  reject: 'reject',
  explain: 'explain',
  escalate: 'escalate',
  forceAccept: 'force_accept',
  reopen: 'reopen',
  markStale: 'mark_stale',
} as const;

export type ShiftAcceptanceAction =
  (typeof SHIFT_ACCEPTANCE_ACTION)[keyof typeof SHIFT_ACCEPTANCE_ACTION];

/**
 * HTTP sxemasi shu ro'yxatdan quriladi (qo'lda takrorlanmaydi). Tizim
 * amallari (`open_for_review`, `mark_stale`) ham ichida: ularni sxemada
 * to'sish o'rniga FSM aktyor bo'yicha rad etadi — qoida BITTA joyda.
 */
export const SHIFT_ACCEPTANCE_ACTIONS = Object.values(
  SHIFT_ACCEPTANCE_ACTION,
) as ShiftAcceptanceAction[];

/**
 * Aktyorlar. `cashier` — kunlik KPI'dagi `employee` ning smena tilidagi
 * nomi: u faqat O'Z smenasiga tushuntirish bera oladi (tekshiruv servisda).
 */
export const SHIFT_ACTOR = {
  system: 'system',
  manager: 'manager',
  cashier: 'cashier',
  owner: 'owner',
} as const;

export type ShiftActor = (typeof SHIFT_ACTOR)[keyof typeof SHIFT_ACTOR];

// ── O'tishlar jadvali ───────────────────────────────────────────────────────

export type ShiftTransition = AcceptanceTransition<
  ShiftAcceptanceState,
  ShiftAcceptanceAction,
  ShiftActor
>;

const S = SHIFT_ACCEPTANCE_STATE;
const A = SHIFT_ACCEPTANCE_ACTION;

export const SHIFT_TRANSITIONS: readonly ShiftTransition[] = [
  {
    // Smenani yopish paytida tizim chaqiradi (`cashier-session.service.close`).
    action: A.openForReview,
    from: [S.open],
    to: S.pending,
    actors: [SHIFT_ACTOR.system],
    reasonRequired: false,
    idempotent: true,
  },
  {
    // `stale` dan ham qabul qilinadi: eskirgan smena qayta ko'rilib yopiladi.
    action: A.accept,
    from: [S.pending, S.stale],
    to: S.accepted,
    actors: [SHIFT_ACTOR.manager, SHIFT_ACTOR.owner],
    reasonRequired: false,
    idempotent: true,
  },
  {
    action: A.reject,
    from: [S.pending, S.stale],
    to: S.rejected,
    actors: [SHIFT_ACTOR.manager, SHIFT_ACTOR.owner],
    reasonRequired: true,
    idempotent: true,
  },
  {
    // Kassirning tushuntirishi smenani navbatga QAYTARADI — javobsiz
    // qolmaydi. Menejer ham yozishi mumkin (telefonda aytilganini kiritish).
    action: A.explain,
    from: [S.rejected],
    to: S.pending,
    actors: [SHIFT_ACTOR.cashier, SHIFT_ACTOR.manager],
    reasonRequired: false,
    idempotent: false,
  },
  {
    action: A.escalate,
    from: [S.pending, S.rejected, S.stale],
    to: S.escalated,
    actors: [SHIFT_ACTOR.manager, SHIFT_ACTOR.system],
    reasonRequired: true,
    idempotent: true,
  },
  {
    action: A.forceAccept,
    from: [S.escalated],
    to: S.forceAccepted,
    actors: [SHIFT_ACTOR.owner],
    reasonRequired: true,
    idempotent: true,
  },
  {
    // Egasi menejerga qaytaradi — eskalatsiya bir tomonlama ko'cha emas.
    action: A.reopen,
    from: [S.accepted, S.forceAccepted, S.escalated, S.rejected],
    to: S.pending,
    actors: [SHIFT_ACTOR.manager, SHIFT_ACTOR.owner],
    reasonRequired: true,
    idempotent: false,
  },
  {
    // Faqat YOPILGAN qabul eskiradi. Navbatda turgan smenani «eskirdi» deb
    // belgilash menejerga yolg'on signal berardi.
    action: A.markStale,
    from: [S.accepted, S.forceAccepted],
    to: S.stale,
    actors: [SHIFT_ACTOR.system],
    reasonRequired: false,
    idempotent: false,
  },
];

// ── Sabab kodlari ───────────────────────────────────────────────────────────

/**
 * Yopiq ro'yxat — sababsiz yopilgan navbat statistikasiz navbat. Keyin
 * «rad etishlarning yarmi Z-hisobot mos kelmagani uchun» degan javob shundan
 * chiqadi; erkin matn buni bermaydi.
 */
export const SHIFT_REASON_CODES = {
  [A.reject]: [
    'variance_unexplained', // kassa farqi tushuntirilmagan
    'zreport_mismatch', // Z-hisobot raqamlari mos kelmadi
    'cash_shortage', // kamomad — alohida tergov kerak
    'document_missing', // hujjat/chek biriktirilmagan
    'discipline', // intizom
    'other',
  ],
  [A.escalate]: [
    'no_response', // kassir javob bermadi
    'manager_conflict', // manfaatlar to'qnashuvi
    'above_manager_limit', // summa menejer vakolatidan tashqari
    'other',
  ],
  [A.forceAccept]: [
    'manager_absent', // menejer yo'q — smena osilib qolmasin
    'dispute_timeout', // nizo cho'zildi, egasi yopdi
    'owner_decision',
    'other',
  ],
  [A.reopen]: ['new_information', 'correction', 'cashier_complaint', 'other'],
} as const satisfies Partial<Record<ShiftAcceptanceAction, readonly string[]>>;

// ── Dvigatel ────────────────────────────────────────────────────────────────

const FSM = createAcceptanceFsm<ShiftAcceptanceState, ShiftAcceptanceAction, ShiftActor>({
  transitions: SHIFT_TRANSITIONS,
  reasonCodes: SHIFT_REASON_CODES,
});

export type ShiftFsmFailure = AcceptanceFailure<
  ShiftAcceptanceState,
  ShiftAcceptanceAction,
  ShiftActor
>;
export type ShiftFsmResult = AcceptanceResult<
  ShiftAcceptanceState,
  ShiftAcceptanceAction,
  ShiftActor
>;
export type ShiftFsmInput = AcceptanceInput<
  ShiftAcceptanceState,
  ShiftAcceptanceAction,
  ShiftActor
>;

/** Yagona kirish nuqtasi — servis SHU javobni bajaradi. */
export function evaluateShiftAcceptance(input: ShiftFsmInput): ShiftFsmResult {
  return FSM.evaluate(input);
}

export function allowedShiftActions(
  state: ShiftAcceptanceState,
  actor: ShiftActor,
): ShiftAcceptanceAction[] {
  return FSM.allowedActions(state, actor);
}

export function shiftReasonCodesFor(action: ShiftAcceptanceAction): readonly string[] {
  return FSM.reasonCodesFor(action);
}

// ── So'rovlar ───────────────────────────────────────────────────────────────

/** Qabul YOPILGANMI — menejer navbatidan chiqqan holatlar. */
export function isAcceptanceSettled(state: ShiftAcceptanceState): boolean {
  return state === S.accepted || state === S.forceAccepted;
}

/** Menejer navbatida ko'rinadigan holatlar. */
export const SHIFT_QUEUE_STATES: readonly ShiftAcceptanceState[] = [
  S.pending,
  S.rejected,
  S.stale,
  S.escalated,
];

/**
 * Javobgarlik taxtasidagi holatlar — «kassir ustida qolgan yopilmagan smena».
 *
 * `open` bu yerda YO'Q ataylab: ochiq smena alohida majburiyat (`open_shift`)
 * va u yerda yashiqdagi pul bilan sanaladi. Ikkalasida ham sanash bitta
 * smenani ikki marta ko'rsatardi.
 */
export const ACCOUNTABLE_STATES: readonly ShiftAcceptanceState[] = SHIFT_QUEUE_STATES;

export function isAccountable(state: ShiftAcceptanceState): boolean {
  return ACCOUNTABLE_STATES.includes(state);
}

/** Halqa KASSIR tomonda — u tushuntirish yozmaguncha navbat qimirlamaydi. */
export function awaitsCashier(state: ShiftAcceptanceState): boolean {
  return state === S.rejected;
}

/** Menejer javobsiz qoldirgan smena necha kundan keyin egasiga chiqadi. */
export const SHIFT_ESCALATE_AFTER_DAYS = 3;
