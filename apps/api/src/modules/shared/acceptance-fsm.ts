/**
 * QABUL-FSM DVIGATELI — «kimdir tayyorladi, boshqasi qabul qiladi» naqshi.
 *
 * Kelib chiqishi: `manager/kpi/daily-kpi-fsm.ts` (4M.2 kunlik KPI qabuli), u
 * o'z navbatida `supply-approval` dan olingan. MK08 da smena yakuni ham AYNAN
 * shu naqshni talab qildi (TZ §6 — «qabul naqshini kengaytirish»), shuning
 * uchun **qoida** shu yerga ko'chirildi, **jadval** esa har obyektda o'ziniki
 * qoladi.
 *
 * Nega nusxa ko'chirilmadi: ikki nusxa bir kunda ikki xil bo'ladi va farq
 * jimgina yashaydi. Repoda shu klass allaqachon yuz bergan — `api-client`
 * `download()` nusxasida 401-retry shoxi tushib qolgan edi va uni faqat
 * md5-solishtirish topdi. Qabul oqimida bunday yo'qolgan shox «sababsiz rad
 * etish» yoki «ikki marta bonus» degani.
 *
 * Dvigatel HECH NARSA bilmaydi: na Prisma, na Nest, na obyekt turi. U faqat
 * o'tishlar jadvalini o'qiydi va HUKM qaytaradi — yozishni chaqiruvchi qiladi.
 */

// ── Jadval ──────────────────────────────────────────────────────────────────

export interface AcceptanceTransition<S extends string, A extends string, Actor extends string> {
  readonly action: A;
  readonly from: readonly S[];
  readonly to: S;
  readonly actors: readonly Actor[];
  /** Sabab kodi majburiymi. */
  readonly reasonRequired: boolean;
  /**
   * Amal allaqachon maqsad holatiga olib kelgan bo'lsa — takror chaqiruv XATO
   * emas, **no-op** (idempotentlik shartnomasi).
   *
   * Nega kerak: menejer 20+ obyektni ketma-ket yopadi va `A` ni ikki marta
   * bosishi normal hodisa. Busiz ikkinchi bosish 409 berardi; muhimrog'i —
   * pul yozadigan o'tishda takror o'tish pulni IKKI MARTA yozardi.
   * No-op holatida na yozuv, na jurnal qatori bo'ladi.
   *
   * «Tushuntirish» va «qayta ochish» kabi amallar idempotent EMAS — ular har
   * safar YANGI hodisa (matn va sabab har safar boshqacha).
   */
  readonly idempotent: boolean;
}

export interface AcceptanceSpec<S extends string, A extends string, Actor extends string> {
  readonly transitions: readonly AcceptanceTransition<S, A, Actor>[];
  /**
   * Amal → yopiq sabab-kodlari ro'yxati. Ro'yxati yo'q amal ixtiyoriy sababni
   * qabul qiladi (tekshirilmaydi), lekin `other` qoidasi baribir ishlaydi.
   */
  readonly reasonCodes: Readonly<Partial<Record<A, readonly string[]>>>;
}

// ── Hukm ────────────────────────────────────────────────────────────────────

export type AcceptanceFailure<S extends string, A extends string, Actor extends string> =
  | { readonly code: 'unknown_action'; readonly action: string }
  | {
      readonly code: 'illegal_transition';
      readonly action: A;
      readonly from: S;
      readonly allowed: readonly S[];
    }
  | { readonly code: 'actor_not_allowed'; readonly action: A; readonly actor: Actor }
  | { readonly code: 'reason_required'; readonly action: A }
  | { readonly code: 'unknown_reason'; readonly action: A; readonly reasonCode: string }
  | { readonly code: 'comment_required'; readonly action: A };

export type AcceptanceResult<S extends string, A extends string, Actor extends string> =
  | {
      readonly ok: true;
      readonly to: S;
      readonly transition: AcceptanceTransition<S, A, Actor>;
      /**
       * Obyekt ALLAQACHON maqsad holatida edi — yozish ham, jurnal qatori ham
       * SHART EMAS. Chaqiruvchi yon ta'sirlarni (pul, bildirishnoma)
       * o'tkazib yuborishi kerak: idempotentlik shu bilan ta'minlanadi.
       */
      readonly noop: boolean;
    }
  | { readonly ok: false; readonly failure: AcceptanceFailure<S, A, Actor> };

export interface AcceptanceInput<S extends string, A extends string, Actor extends string> {
  readonly from: S;
  readonly action: A;
  readonly actor: Actor;
  readonly reasonCode?: string | null;
  readonly comment?: string | null;
}

/**
 * `other` — har ro'yxatning qochish yo'li. Izohsiz `other` sabab kodlarini
 * o'ldiradi: hamma «other» ni tanlaydi va statistika yo'qoladi. Shuning uchun
 * `other` da izoh MAJBURIY.
 */
export function commentRequired(reasonCode: string | null | undefined): boolean {
  return reasonCode === 'other';
}

// ── Dvigatel ────────────────────────────────────────────────────────────────

export interface AcceptanceFsm<S extends string, A extends string, Actor extends string> {
  transitionFor(action: A): AcceptanceTransition<S, A, Actor> | undefined;
  /** Shu holatdan qaysi amallar mumkin — ekrandagi tugmalar shundan chiziladi. */
  allowedActions(state: S, actor: Actor): A[];
  reasonCodesFor(action: A): readonly string[];
  /** Yagona kirish nuqtasi: servis SHU javobni bajaradi, o'z shartini yozmaydi. */
  evaluate(input: AcceptanceInput<S, A, Actor>): AcceptanceResult<S, A, Actor>;
  /**
   * Sabab tekshiruvi alohida — holatni O'ZGARTIRMAYDIGAN amallar (masalan
   * ko'rsatkich tuzatmasi) uchun. Qoida `evaluate` bilan AYNAN bir xil:
   * takrorlanmasin.
   */
  checkReason(
    action: A,
    reasonCode: string | null | undefined,
    comment: string | null | undefined,
    transition: { readonly reasonRequired: boolean },
  ): AcceptanceFailure<S, A, Actor> | null;
}

export function createAcceptanceFsm<S extends string, A extends string, Actor extends string>(
  spec: AcceptanceSpec<S, A, Actor>,
): AcceptanceFsm<S, A, Actor> {
  const transitionFor = (action: A) => spec.transitions.find((t) => t.action === action);

  const reasonCodesFor = (action: A): readonly string[] =>
    (spec.reasonCodes as Record<string, readonly string[] | undefined>)[action] ?? [];

  const checkReason = (
    action: A,
    reasonCode: string | null | undefined,
    comment: string | null | undefined,
    transition: { readonly reasonRequired: boolean },
  ): AcceptanceFailure<S, A, Actor> | null => {
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
  };

  return {
    transitionFor,
    reasonCodesFor,
    checkReason,

    allowedActions: (state, actor) =>
      spec.transitions
        .filter((t) => t.from.includes(state) && t.actors.includes(actor))
        .map((t) => t.action),

    evaluate: (input) => {
      const transition = transitionFor(input.action);
      if (!transition) {
        return { ok: false, failure: { code: 'unknown_action', action: input.action } };
      }

      // Aktyor va sabab tekshiruvi no-op yo'lida ham ISHLAYDI (pastda) — aks
      // holda «takror» teshigi orqali sababsiz rad etish yoki begona aktyor
      // o'tib ketardi.
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
    },
  };
}
