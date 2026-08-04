/**
 * Kunlik KPI qabul qilish FSM (menejer TZ §3, bosqich 4M.2).
 *
 * SOF MODUL — Prisma ham, Nest ham yo'q. Sabab: qabul qilish oqimining butun
 * qoidasi shu yerda, va u bazasiz testlanadi. Servis faqat shu javobni bajaradi.
 *
 * Naqsh `supply-approval` dan olingan (repoda ishlayapti): jadval bilan
 * belgilangan o'tishlar + optimistik da'vo + append-only hodisa jurnali.
 * Yangi mexanizm o'ylab topilmadi.
 *
 * ┌──────────┐ open_for_review ┌─────────┐   accept   ┌──────────┐
 * │ computed │────────────────>│ pending │───────────>│ accepted │
 * └──────────┘   (tizim)       └─────────┘            └──────────┘
 *                               │    ↑                  │      │
 *                        reject │    │ explain          │      │ mark_stale
 *                               ↓    │ (xodim)          │      ↓
 *                          ┌──────────┐                 │  ┌───────┐
 *                          │ rejected │                 │  │ stale │
 *                          └──────────┘                 │  └───────┘
 *                               │  escalate             │      │ accept
 *                               ↓  (N kun jim)          │      ↓
 *                         ┌───────────┐ force_accept  ┌─────────────────┐
 *                         │ escalated │──────────────>│ force_accepted  │
 *                         └───────────┘   (egasi)     └─────────────────┘
 *
 * IKKI QOIDA BUTUN OQIMNI USHLAB TURADI:
 *   1. **Qabul qilingan kun MUZLAYDI** — unga yozib bo'lmaydi. O'zgartirish
 *      kerak bo'lsa avval `reopen` (sabab bilan) yoki tizim `mark_stale` qiladi.
 *      Aks holda oylikka ketgan raqam jimgina o'zgarardi.
 *   2. **Faqat `accepted`/`force_accepted` oylikka kiradi** (M-Q8 bloklash shu
 *      yerda). Bu `countsTowardPayroll` da bitta joyda turadi — 4M.3 shuni
 *      o'qiydi, o'z ro'yxatini yozmaydi.
 */

// ── Holatlar ────────────────────────────────────────────────────────────────

export const DAILY_KPI_STATE = {
  /** Tizim hisobladi, hali ko'rikka qo'yilmagan (masalan bugungi jonli kun). */
  computed: 'computed',
  /** Kun yopildi, menejer qaroriga navbatda. */
  pending: 'pending',
  /** Menejer qabul qildi. MUZLAGAN. */
  accepted: 'accepted',
  /** Menejer rad etdi, xodimdan tushuntirish so'raldi. */
  rejected: 'rejected',
  /** Menejer hal qilmadi/qila olmadi — egasiga chiqdi. */
  escalated: 'escalated',
  /** Egasi majburiy yopdi (boshi berk ko'chadan chiqish klapani). MUZLAGAN. */
  forceAccepted: 'force_accepted',
  /** Qabul qilingandan KEYIN manba hujjat o'zgardi — qayta ko'rik kerak. */
  stale: 'stale',
} as const;

export type DailyKpiState = (typeof DAILY_KPI_STATE)[keyof typeof DAILY_KPI_STATE];

export const DAILY_KPI_STATES = Object.values(DAILY_KPI_STATE) as DailyKpiState[];

// ── Amallar ─────────────────────────────────────────────────────────────────

export const DAILY_KPI_ACTION = {
  openForReview: 'open_for_review',
  accept: 'accept',
  reject: 'reject',
  explain: 'explain',
  escalate: 'escalate',
  forceAccept: 'force_accept',
  reopen: 'reopen',
  markStale: 'mark_stale',
  /** Ko'rsatkich tuzatmasi — HOLATNI O'ZGARTIRMAYDI, lekin jurnalga tushadi. */
  adjust: 'adjust',
} as const;

export type DailyKpiAction = (typeof DAILY_KPI_ACTION)[keyof typeof DAILY_KPI_ACTION];

/** Kim amalni bajarishi mumkin. Ruxsat tekshiruvi servisda, ro'yxat shu yerda. */
export const ACTOR = {
  system: 'system',
  manager: 'manager',
  employee: 'employee',
  owner: 'owner',
} as const;

export type Actor = (typeof ACTOR)[keyof typeof ACTOR];

// ── O'tishlar jadvali ───────────────────────────────────────────────────────

export interface Transition {
  readonly action: DailyKpiAction;
  readonly from: readonly DailyKpiState[];
  readonly to: DailyKpiState;
  readonly actors: readonly Actor[];
  /** Sabab kodi majburiymi. */
  readonly reasonRequired: boolean;
  /**
   * Amal allaqachon maqsad holatiga olib kelgan bo'lsa — takror chaqiruv XATO
   * emas, **no-op** (TZ §10.2 idempotentlik shartnomasi).
   *
   * Nega kerak: menejer 20+ kunni klaviatura bilan ketma-ket yopadi va `A` ni
   * ikki marta bosishi mutlaqo normal hodisa. Busiz ikkinchi bosish 409 berardi
   * va menejer «ishlamadi» deb o'ylardi; muhimrog'i — 4M.3 da bonus yozilganda
   * takror o'tish bonusni IKKI MARTA yozib yuborardi. Idempotentlik shu yerda
   * boshlanadi: no-op holatida na yozuv, na jurnal qatori bo'ladi.
   *
   * `reopen` va `explain` idempotent EMAS — ular har safar YANGI hodisa
   * (qayta ochish sababi va tushuntirish matni har safar boshqacha).
   */
  readonly idempotent: boolean;
}

export const TRANSITIONS: readonly Transition[] = [
  {
    action: DAILY_KPI_ACTION.openForReview,
    from: [DAILY_KPI_STATE.computed],
    to: DAILY_KPI_STATE.pending,
    actors: [ACTOR.system],
    reasonRequired: false,
    idempotent: true,
  },
  {
    // `stale` dan ham qabul qilinadi: eskirgan kun qayta ko'rilib yopiladi
    // (oylikka TUZATUVCHI qator ketadi — §3.4, 4M.3).
    action: DAILY_KPI_ACTION.accept,
    from: [DAILY_KPI_STATE.pending, DAILY_KPI_STATE.stale],
    to: DAILY_KPI_STATE.accepted,
    actors: [ACTOR.manager, ACTOR.owner],
    reasonRequired: false,
    idempotent: true,
  },
  {
    action: DAILY_KPI_ACTION.reject,
    from: [DAILY_KPI_STATE.pending, DAILY_KPI_STATE.stale],
    to: DAILY_KPI_STATE.rejected,
    actors: [ACTOR.manager, ACTOR.owner],
    reasonRequired: true,
    idempotent: true,
  },
  {
    // Xodimning tushuntirishi kunni navbatga QAYTARADI — javobsiz qolmaydi.
    action: DAILY_KPI_ACTION.explain,
    from: [DAILY_KPI_STATE.rejected],
    to: DAILY_KPI_STATE.pending,
    actors: [ACTOR.employee, ACTOR.manager],
    reasonRequired: false,
    idempotent: false,
  },
  {
    action: DAILY_KPI_ACTION.escalate,
    from: [DAILY_KPI_STATE.pending, DAILY_KPI_STATE.rejected, DAILY_KPI_STATE.stale],
    to: DAILY_KPI_STATE.escalated,
    actors: [ACTOR.manager, ACTOR.system],
    reasonRequired: true,
    idempotent: true,
  },
  {
    action: DAILY_KPI_ACTION.forceAccept,
    from: [DAILY_KPI_STATE.escalated],
    to: DAILY_KPI_STATE.forceAccepted,
    actors: [ACTOR.owner],
    reasonRequired: true,
    idempotent: true,
  },
  {
    // Egasi menejerga qaytaradi — eskalatsiya bir tomonlama ko'cha emas.
    action: DAILY_KPI_ACTION.reopen,
    from: [
      DAILY_KPI_STATE.accepted,
      DAILY_KPI_STATE.forceAccepted,
      DAILY_KPI_STATE.escalated,
      DAILY_KPI_STATE.rejected,
    ],
    to: DAILY_KPI_STATE.pending,
    actors: [ACTOR.manager, ACTOR.owner],
    reasonRequired: true,
    idempotent: false,
  },
  {
    // Faqat MUZLAGAN kun eskiradi. Muzlamagan kun shunchaki qayta hisoblanadi —
    // uni «eskirgan» deb belgilash menejerga yolg'on signal berardi.
    action: DAILY_KPI_ACTION.markStale,
    from: [DAILY_KPI_STATE.accepted, DAILY_KPI_STATE.forceAccepted],
    to: DAILY_KPI_STATE.stale,
    actors: [ACTOR.system],
    reasonRequired: false,
    // Idempotent EMAS ataylab: «faqat MUZLAGAN kun eskiradi» invarianti
    // saqlanishi kerak. `stale → stale` ni no-op qilib qo'ysak, allaqachon
    // navbatda turgan kunni ham «eskirdi» deb belgilash mumkin bo'lib qolardi.
    idempotent: false,
  },
];

// ── So'rovlar ───────────────────────────────────────────────────────────────

/** Muzlagan kunga YOZIB BO'LMAYDI (tuzatma ham, qayta hisoblash ham). */
export function isFrozen(state: DailyKpiState): boolean {
  return state === DAILY_KPI_STATE.accepted || state === DAILY_KPI_STATE.forceAccepted;
}

/**
 * Oylikka faqat shu ikki holat kiradi (M-Q8). 4M.3 shu funksiyani chaqiradi —
 * o'z ro'yxatini yozmaydi, aks holda ikki joyda ikki javob bo'lardi.
 */
export function countsTowardPayroll(state: DailyKpiState): boolean {
  return state === DAILY_KPI_STATE.accepted || state === DAILY_KPI_STATE.forceAccepted;
}

/** Menejer navbatida ko'rinadigan holatlar. */
export const QUEUE_STATES: readonly DailyKpiState[] = [
  DAILY_KPI_STATE.pending,
  DAILY_KPI_STATE.rejected,
  DAILY_KPI_STATE.stale,
  DAILY_KPI_STATE.escalated,
];

/** Ko'rsatkich tuzatmasiga ruxsat beruvchi holatlar (muzlagan emas, yopilmagan). */
export const ADJUSTABLE_STATES: readonly DailyKpiState[] = [
  DAILY_KPI_STATE.pending,
  DAILY_KPI_STATE.rejected,
  DAILY_KPI_STATE.stale,
  DAILY_KPI_STATE.escalated,
];

export function isAdjustable(state: DailyKpiState): boolean {
  return ADJUSTABLE_STATES.includes(state);
}

export function transitionFor(action: DailyKpiAction): Transition | undefined {
  return TRANSITIONS.find((t) => t.action === action);
}

/** Shu holatdan qaysi amallar mumkin — ekrandagi tugmalar shundan chiziladi. */
export function allowedActions(state: DailyKpiState, actor: Actor): DailyKpiAction[] {
  return TRANSITIONS.filter((t) => t.from.includes(state) && t.actors.includes(actor)).map(
    (t) => t.action,
  );
}

// ── Sabab kodlari ───────────────────────────────────────────────────────────

/**
 * Sababsiz yopilgan navbat — statistikasiz navbat (TZ §5.3). Shuning uchun
 * kodlar YOPIQ ro'yxat: keyin «zararga sotuvlarning 30% — raqobatchi narxi»
 * kabi javob chiqadi. Erkin matn buni bermaydi.
 */
export const REASON_CODES = {
  [DAILY_KPI_ACTION.adjust]: [
    'data_error', // manba noto'g'ri yozgan
    'system_gap', // tizim o'lchamagan (masalan tan narx muzlatilmagan)
    'approved_exception', // oldindan kelishilgan chegirma/harakat
    'probation', // yangi xodim — imtiyozli davr (§2.5)
    'covered_shift', // boshqa smenani qopladi
    'equipment_failure', // texnika ishlamadi
    'other',
  ],
  [DAILY_KPI_ACTION.reject]: [
    'variance_unexplained', // kassa farqi tushuntirilmagan
    'discount_unexplained', // chegirma asossiz
    'discipline', // intizom
    'data_dispute', // raqamga rozi emasman
    'other',
  ],
  [DAILY_KPI_ACTION.escalate]: [
    'no_response', // xodim javob bermadi
    'manager_conflict', // manfaatlar to'qnashuvi
    'above_manager_limit', // menejer vakolatidan tashqari
    'other',
  ],
  [DAILY_KPI_ACTION.forceAccept]: [
    'manager_absent', // menejer yo'q — xodim oyliksiz qolmasin
    'dispute_timeout', // nizo cho'zildi, egasi yopdi
    'owner_decision',
    'other',
  ],
  [DAILY_KPI_ACTION.reopen]: ['new_information', 'correction', 'employee_complaint', 'other'],
} as const satisfies Partial<Record<DailyKpiAction, readonly string[]>>;

export type ReasonCodeAction = keyof typeof REASON_CODES;

export function reasonCodesFor(action: DailyKpiAction): readonly string[] {
  return (REASON_CODES as Record<string, readonly string[] | undefined>)[action] ?? [];
}

/**
 * `other` — har ro'yxatning qochish yo'li. Izohsiz `other` sabab kodlarini
 * o'ldiradi: hamma «other» ni tanlaydi va statistika yo'qoladi. Shuning uchun
 * `other` da izoh MAJBURIY.
 */
export function commentRequired(reasonCode: string | null | undefined): boolean {
  return reasonCode === 'other';
}

/** Menejer javob kutadigan kun necha kundan keyin egasiga chiqadi (§1.2). */
export const ESCALATE_AFTER_DAYS = 3;

// ── Tekshirish ──────────────────────────────────────────────────────────────

export type FsmFailure =
  | { readonly code: 'unknown_action'; readonly action: string }
  | {
      readonly code: 'illegal_transition';
      readonly action: DailyKpiAction;
      readonly from: DailyKpiState;
      readonly allowed: readonly DailyKpiState[];
    }
  | { readonly code: 'actor_not_allowed'; readonly action: DailyKpiAction; readonly actor: Actor }
  | { readonly code: 'reason_required'; readonly action: DailyKpiAction }
  | {
      readonly code: 'unknown_reason';
      readonly action: DailyKpiAction;
      readonly reasonCode: string;
    }
  | { readonly code: 'comment_required'; readonly action: DailyKpiAction };

export type FsmResult =
  | {
      readonly ok: true;
      readonly to: DailyKpiState;
      readonly transition: Transition;
      /**
       * Kun ALLAQACHON maqsad holatida edi — yozish ham, jurnal qatori ham
       * SHART EMAS. Chaqiruvchi yon ta'sirlarni (bonus, bildirishnoma)
       * o'tkazib yuborishi kerak: idempotentlik shu bilan ta'minlanadi.
       */
      readonly noop: boolean;
    }
  | { readonly ok: false; readonly failure: FsmFailure };

export interface FsmInput {
  readonly from: DailyKpiState;
  readonly action: DailyKpiAction;
  readonly actor: Actor;
  readonly reasonCode?: string | null;
  readonly comment?: string | null;
}

/**
 * Yagona kirish nuqtasi. Servis SHU javobni bajaradi — o'z shartini yozmaydi,
 * aks holda qoida ikki joyda bo'lib, ular bir-biridan uzoqlashadi.
 */
export function evaluate(input: FsmInput): FsmResult {
  const transition = transitionFor(input.action);
  if (!transition) return { ok: false, failure: { code: 'unknown_action', action: input.action } };

  // Aktyor va sabab tekshiruvi no-op yo'lida ham ISHLAYDI (pastda) — aks holda
  // «takror» teshigi orqali sababsiz rad etish yoki begona aktyor o'tib ketardi.
  const repeat = transition.idempotent && input.from === transition.to;

  if (!repeat && !transition.from.includes(input.from)) {
    return {
      ok: false,
      failure: {
        code: 'illegal_transition',
        action: input.action,
        from: input.from,
        allowed: transition.from,
      },
    };
  }

  if (!transition.actors.includes(input.actor)) {
    return {
      ok: false,
      failure: { code: 'actor_not_allowed', action: input.action, actor: input.actor },
    };
  }

  const reasonFailure = checkReason(input.action, input.reasonCode, input.comment, transition);
  if (reasonFailure) return { ok: false, failure: reasonFailure };

  return { ok: true, to: transition.to, transition, noop: repeat };
}

/**
 * Tuzatma holatni o'zgartirmaydi, shuning uchun `evaluate` dan alohida — lekin
 * sabab qoidasi AYNAN bir xil (kod takrorlanmasin).
 */
export function evaluateAdjust(input: {
  readonly from: DailyKpiState;
  readonly reasonCode?: string | null;
  readonly comment?: string | null;
}): { ok: true } | { ok: false; failure: FsmFailure } {
  if (!isAdjustable(input.from)) {
    return {
      ok: false,
      failure: {
        code: 'illegal_transition',
        action: DAILY_KPI_ACTION.adjust,
        from: input.from,
        allowed: ADJUSTABLE_STATES,
      },
    };
  }
  const failure = checkReason(DAILY_KPI_ACTION.adjust, input.reasonCode, input.comment, {
    reasonRequired: true,
  });
  return failure ? { ok: false, failure } : { ok: true };
}

function checkReason(
  action: DailyKpiAction,
  reasonCode: string | null | undefined,
  comment: string | null | undefined,
  transition: { readonly reasonRequired: boolean },
): FsmFailure | null {
  const codes = reasonCodesFor(action);

  if (!reasonCode) {
    return transition.reasonRequired ? { code: 'reason_required', action } : null;
  }
  if (codes.length > 0 && !codes.includes(reasonCode)) {
    return { code: 'unknown_reason', action, reasonCode };
  }
  if (commentRequired(reasonCode) && !comment?.trim()) {
    return { code: 'comment_required', action };
  }
  return null;
}
