import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * Kunlik xodim KPI — qabul qilish state-machine (menejer TZ kengaytmasi §3.1).
 *
 * SOF modul: DB ham, soat ham, Nest DI ham yo'q. Barcha o'tish qoidalari SHU
 * YERDA turadi, servis esa yupqa Prisma-I/O bo'lib qoladi. Naqsh
 * `supply-approval.fsm.ts` dan olingan — repoda ishlayotgan mexanizm qayta
 * o'ylab topilmaydi (TZ §3.1 shuni talab qiladi).
 *
 * TZ diagrammasi:
 *
 *   hisoblandi → qabul kutmoqda → QABUL QILINDI
 *                     ↓
 *               rad etildi (tushuntirish so'raldi) → tushuntirish keldi → qabul kutmoqda
 *                     ↓
 *               N kun javobsiz → EGAGA ESKALATSIYA → egasi majburiy yopadi
 *
 *   QABUL QILINDI → (manba hujjat o'zgardi) → ESKIRGAN → qabul kutmoqda
 *   QABUL QILINDI → (menejer qayta ochadi, sabab bilan) → qabul kutmoqda
 */

export const DAILY_KPI_STATES = [
  /** Cron hisobladi, lekin kun hali yopilmagan (bugungi jonli kun). */
  'computed',
  /** Kun yopildi — menejer navbatida turibdi. */
  'pending',
  /** Menejer qabul qildi — oylikka kiradi (4M.3). */
  'accepted',
  /** Menejer rad etdi, xodimdan tushuntirish kutilmoqda. */
  'rejected',
  /** Qabul qilingandan keyin manba hujjat o'zgardi — navbatga qaytdi (§3.4). */
  'stale',
  /** N kun javobsiz qolgani uchun egasining navbatiga o'tdi (§1.2). */
  'escalated',
] as const;

export type DailyKpiState = (typeof DAILY_KPI_STATES)[number];

export type DailyKpiAction =
  | 'submit'
  | 'accept'
  | 'reject'
  | 'explain'
  | 'escalate'
  | 'force_accept'
  | 'reopen'
  | 'mark_stale';

/** Kim harakat qilyapti — vakolat tekshiruvi shundan (G1 imtiyoz oshirish taqiqi). */
export type DailyKpiActor = 'system' | 'manager' | 'owner' | 'employee';

interface TransitionRule {
  /** Qaysi holatlardan bu harakat mumkin. */
  from: readonly DailyKpiState[];
  /** Natijaviy holat. */
  to: DailyKpiState;
  /** Sabab kodi MAJBURIYmi (§3.2, §5.3 — sababsiz yopilgan navbat statistikasiz navbat). */
  reasonRequired: boolean;
  /** Kim bajara oladi. */
  actors: readonly DailyKpiActor[];
  /**
   * Harakat allaqachon shu holatga olib kelgan bo'lsa — takror chaqiruv XATO
   * emas, no-op. Idempotentlik shartnomasi (TZ §10.2): bir kunni ikki marta
   * qabul qilish bonusni ikki marta yozmasligi kerak, lekin 409 ham bermasligi
   * kerak — menejer ikki marta bosishi normal hodisa.
   */
  idempotent: boolean;
}

export const DAILY_KPI_TRANSITIONS: Readonly<Record<DailyKpiAction, TransitionRule>> = {
  /** Kun yopildi (cron kechagi kunni yakunlagach) — navbatga qo'yiladi. */
  submit: {
    from: ['computed'],
    to: 'pending',
    reasonRequired: false,
    actors: ['system'],
    idempotent: true,
  },
  /**
   * Qabul. `stale` va `escalated` dan ham mumkin: eskirgan kun qayta ko'riladi,
   * eskalatsiyadagi kunni menejer o'zi hal qilsa navbat yopiladi.
   */
  accept: {
    from: ['pending', 'rejected', 'stale', 'escalated'],
    to: 'accepted',
    reasonRequired: false,
    actors: ['manager', 'owner'],
    idempotent: true,
  },
  /** Rad etish — xodimga tushuntirish so'rovi ketadi (§3.3). Sabab majburiy. */
  reject: {
    from: ['pending', 'stale', 'escalated'],
    to: 'rejected',
    reasonRequired: true,
    actors: ['manager', 'owner'],
    idempotent: true,
  },
  /** Xodim tushuntirish yozdi — kun navbatga qaytadi. */
  explain: {
    from: ['rejected'],
    to: 'pending',
    reasonRequired: false,
    actors: ['employee', 'manager'],
    idempotent: false,
  },
  /**
   * Egaga eskalatsiya (§1.2 boshi berk ko'cha klapani). Tizim N kundan keyin
   * avtomat, menejer esa o'zi hal qila olmasa qo'lda ko'taradi.
   */
  escalate: {
    from: ['pending', 'rejected'],
    to: 'escalated',
    reasonRequired: false,
    actors: ['system', 'manager'],
    idempotent: true,
  },
  /**
   * Egasi majburiy yopadi — audit yozuvi bilan (§1.2). Sabab MAJBURIY: bu
   * qoidadan chetlanish, keyin «nega yopildi» degan savolga javob kerak.
   */
  force_accept: {
    from: ['escalated'],
    to: 'accepted',
    reasonRequired: true,
    actors: ['owner'],
    idempotent: false,
  },
  /** Menejer qabul qilingan kunni qayta ochadi — sabab bilan (§10.2). */
  reopen: {
    from: ['accepted'],
    to: 'pending',
    reasonRequired: true,
    actors: ['manager', 'owner'],
    idempotent: false,
  },
  /** Manba hujjat o'zgardi — tizim eskirgan deb belgilaydi (§3.4). */
  mark_stale: {
    from: ['accepted'],
    to: 'stale',
    reasonRequired: false,
    actors: ['system'],
    idempotent: true,
  },
};

/**
 * Kun YOZILADIGAN holatdami. Qabul qilingan kunga ko'rsatkich tuzatmasi
 * yozilmaydi — avval `reopen` (sabab bilan) kerak. Bu «muzlatish» qo'riqchisi
 * (TZ §10.2) tan narx muzlatish bilan bir klass: to'langan pul ortidagi raqam
 * jimgina o'zgarmasligi kerak.
 */
export function assertWritable(current: DailyKpiState): void {
  if (current === 'accepted') {
    throw new ConflictException(
      "Qabul qilingan kunga yozib bo'lmaydi — avval qayta oching (sabab bilan)",
    );
  }
}

export interface TransitionResult {
  /** Yangi holat. */
  to: DailyKpiState;
  /**
   * Holat allaqachon shunday bo'lgani uchun yozish shart emas. Chaqiruvchi
   * yon ta'sirlarni (bonus yozish, bildirishnoma) O'TKAZIB YUBORISHI kerak —
   * idempotentlik aynan shu yerda ta'minlanadi.
   */
  noop: boolean;
}

/**
 * O'tishni hisoblaydi va qoidabuzarlikda xato tashlaydi.
 *
 * Uch xil rad javobi ataylab uch xil turda:
 *   403 — vakolat yo'q (aktyor);
 *   400 — sabab kodi yozilmagan (chaqiruv noto'g'ri to'ldirilgan);
 *   409 — holat mos emas (ma'lumot boshqa holatda — konflikt).
 */
export function applyTransition(
  action: DailyKpiAction,
  current: DailyKpiState,
  opts: { actor: DailyKpiActor; reasonCode?: string | null },
): TransitionResult {
  const rule = DAILY_KPI_TRANSITIONS[action];

  if (!rule.actors.includes(opts.actor)) {
    throw new ForbiddenException(`'${action}' amalini '${opts.actor}' bajara olmaydi`);
  }

  if (rule.reasonRequired && !opts.reasonCode?.trim()) {
    throw new BadRequestException(`'${action}' uchun sabab kodi majburiy`);
  }

  // Idempotentlik holat tekshiruvidan OLDIN: allaqachon maqsad holatida
  // bo'lgan kun uchun 409 berish menejerning ikkinchi bosishini xatoga
  // aylantirardi (va u xatoni ko'rib, ishlamadi deb o'ylardi).
  if (rule.idempotent && current === rule.to) return { to: rule.to, noop: true };

  if (!rule.from.includes(current)) {
    throw new ConflictException(
      `'${action}' amali '${current}' holatida mumkin emas (kutilgan: ${rule.from.join(', ')})`,
    );
  }

  return { to: rule.to, noop: false };
}

/** Navbatda turgan (menejer ko'rishi kerak) holatlar. */
export const QUEUE_STATES: readonly DailyKpiState[] = ['pending', 'rejected', 'stale', 'escalated'];

/** Kun menejer navbatida turibdimi. */
export function isInQueue(state: DailyKpiState): boolean {
  return QUEUE_STATES.includes(state);
}

/**
 * Sabab kodlari (§5.3). Ro'yxat YOPIQ: erkin matn bo'lsa keyin «zararga
 * sotuvlarning 30% — raqobatchi narxi» degan tahlilni qurib bo'lmaydi.
 * Izoh (`note`) erkin qoladi — u statistikaga kirmaydi.
 */
export const KPI_REASON_CODES = [
  'data_error', // ma'lumot xato hisoblangan
  'source_missing', // manba to'liq emas (tan narx yig'ilmagan va h.k.)
  'approved_exception', // rahbariyat ruxsat bergan chetlanish
  'competitor_price', // raqobatchi narxi (zararga sotuv sababi)
  'expiring_goods', // muddati o'tayotgan tovar
  'employee_fault', // xodim aybi
  'external_cause', // tashqi sabab (transport, elektr, mijoz)
  'other', // boshqa — izoh bilan
] as const;

export type KpiReasonCode = (typeof KPI_REASON_CODES)[number];

export function isReasonCode(v: unknown): v is KpiReasonCode {
  return typeof v === 'string' && (KPI_REASON_CODES as readonly string[]).includes(v);
}

/**
 * Eskalatsiya muddati — kun necha kun javobsiz turgach egasiga o'tadi (§1.2).
 * Sozlama emas, chunki hozircha sozlash yuzasi yo'q; 4M.5 da `ManagerRuleConfig`
 * ga ko'chadi.
 */
export const ESCALATE_AFTER_DAYS = 3;

/** Kun eskalatsiyaga tayyormi (sof funksiya — soat tashqaridan beriladi). */
export function shouldEscalate(
  state: DailyKpiState,
  queuedAt: Date,
  now: Date,
  afterDays = ESCALATE_AFTER_DAYS,
): boolean {
  if (state !== 'pending' && state !== 'rejected') return false;
  const days = (now.getTime() - queuedAt.getTime()) / 86_400_000;
  return days >= afterDays;
}
