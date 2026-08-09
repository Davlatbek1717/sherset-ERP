/**
 * Ishga qabul tomoni — sinov muddati (menejer TZ 4M.4, §6.3 «hayot sikli»).
 *
 * MUAMMO. Bo'shatish tomoni ro'yxat bilan yopilgan (`offboarding.ts`), qabul
 * tomoni esa umuman yo'q edi: sinov muddati hech qayerda saqlanmasdi va
 * **baholash sanasi kelganini hech kim bilmasdi**. Amalda bu ikki xil zarar
 * beradi: (a) xodim muddatsiz «sinovda» qolib ketadi va oylik/ruxsat masalasi
 * hech qachon hal bo'lmaydi; (b) qabul qilishga arzimaydigan odam sinovdan
 * jimgina «o'tib» ketadi, chunki qaror kuni belgilanmagan.
 *
 * YECHIM — bo'shatish bilan bir xil naqsh:
 *   • sinov muddati (boshlanish/tugash) + **baholash sanasi** saqlanadi;
 *   • baholash sanasi yaqinlashganda/o'tganda ogohlantirish chiqadi;
 *   • sinov «o'tdi» deb yopilishi uchun **ro'yxat** bajarilishi shart;
 *   • ⚠️ **tizim biladigan bandni qo'lda «bajarildi» deb belgilash MUMKIN EMAS**
 *     (`offboarding.ts` dagi asosiy qaror shu yerda ham amal qiladi).
 *
 * ASIMMETRIYA (ataylab). Bo'shatishda ro'yxat **arxivlashni** to'sadi; bu yerda
 * ro'yxat faqat **«o'tdi»** ni to'sadi. «O'tmadi» har doim mumkin — aks holda
 * hujjati imzolanmagan odamni ishdan bo'shatish uchun avval hujjatini
 * imzolatish kerak bo'lardi. «O'tmadi» ham xodimni ARXIVLAMAYDI: arxivlash
 * yagona yo'l bilan — bo'shatish ro'yxati orqali bo'ladi (ochiq smena va
 * topshirilmagan naqd shu sababdan chetlab o'tilmaydi).
 *
 * Sof modul — qoidalar DB'siz sinaladi.
 */

import { ITEM_KIND, type ItemKind } from './offboarding.js';

export const ONBOARDING_ITEM = {
  /** Kirish ma'lumotlari berilgan (auto: parol o'rnatilgan). */
  credentialsIssued: 'credentials_issued',
  /** HR/ERP rollari berilgan (auto: `hrRoles` bo'sh emas). */
  rolesAssigned: 'roles_assigned',
  /** KPI profili biriktirilgan (auto) — usiz kunlik KPI hisoblanmaydi. */
  kpiProfileAssigned: 'kpi_profile_assigned',
  /** Telegram ulangan (auto) — **ixtiyoriy**, hamma xodimga shart emas. */
  telegramBound: 'telegram_bound',
  /** Ish o'rni va jihoz berilgan (qo'lda tasdiq — tizim stolni ko'rmaydi). */
  workplaceReady: 'workplace_ready',
  /** Hujjatlar imzolangan: shartnoma, moddiy javobgarlik (qo'lda tasdiq). */
  documentsSigned: 'documents_signed',
} as const;

export type OnboardingItemKey = (typeof ONBOARDING_ITEM)[keyof typeof ONBOARDING_ITEM];

export interface OnboardingItemDef {
  key: OnboardingItemKey;
  kind: ItemKind;
  /** Bajarilmasa sinovni «o'tdi» deb yopishga YO'L QO'YMAYDI. */
  blocking: boolean;
  label: string;
}

/**
 * Ro'yxat.
 *
 * Telegram YAGONA ixtiyoriy band: omborchi yoki kassir telefonsiz ham
 * ishlaydi, va uni bloklovchi qilish sinovni tugatib bo'lmaydigan holatga
 * olib kelardi. Qolgan bandlarsiz xodim jismonan ishlay olmaydi (parol,
 * rollar) yoki baholab bo'lmaydi (KPI profili).
 */
export const ONBOARDING_ITEMS: ReadonlyArray<OnboardingItemDef> = [
  {
    key: ONBOARDING_ITEM.credentialsIssued,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'Kirish ma`lumotlari berilgan',
  },
  {
    key: ONBOARDING_ITEM.rolesAssigned,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'Rollar berilgan',
  },
  {
    key: ONBOARDING_ITEM.kpiProfileAssigned,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'KPI profili biriktirilgan',
  },
  {
    key: ONBOARDING_ITEM.telegramBound,
    kind: ITEM_KIND.auto,
    blocking: false,
    label: 'Telegram ulangan (ixtiyoriy)',
  },
  {
    key: ONBOARDING_ITEM.workplaceReady,
    kind: ITEM_KIND.manual,
    blocking: true,
    label: 'Ish o`rni va jihoz berilgan',
  },
  {
    key: ONBOARDING_ITEM.documentsSigned,
    kind: ITEM_KIND.manual,
    blocking: true,
    label: 'Hujjatlar imzolangan',
  },
];

export function onboardingItemDef(key: string): OnboardingItemDef | null {
  return ONBOARDING_ITEMS.find((i) => i.key === key) ?? null;
}

/**
 * Qo'lda belgilash MUMKINmi.
 *
 * `auto` bandni qo'lda yopishga urinish rad etiladi — aks holda menejer
 * «rollar berildi» deb belgilardi, xodim esa ruxsatsiz qolib birinchi ish
 * kunini yo'qotardi.
 */
export function canMarkOnboardingManually(key: string): boolean {
  return onboardingItemDef(key)?.kind === ITEM_KIND.manual;
}

// ── Ro'yxat holati ───────────────────────────────────────────────────────────

/** Tizim tekshiruvidan kelgan faktlar. */
export interface OnboardingAutoFacts {
  hasPassword: boolean;
  roleCount: number;
  hasKpiProfile: boolean;
  telegramChatId: string | null;
}

/** Qo'lda tasdiqlangan bandlar (offboarding bilan bir xil shakl). */
export interface OnboardingManualState {
  [key: string]: { doneAt: Date; byId: string | null } | undefined;
}

export interface OnboardingItemStatus extends OnboardingItemDef {
  done: boolean;
  /** `auto` bandda — nega bajarilmagani. */
  detail: string | null;
  doneAt: Date | null;
}

export interface OnboardingProgress {
  items: OnboardingItemStatus[];
  doneCount: number;
  total: number;
  /** Bloklovchi bandlarning hammasi bajarilganmi — «o'tdi» SHARTI. */
  canPass: boolean;
  /** Qolgan bloklovchi bandlar — xabarda aynan shular ko'rsatiladi. */
  blockers: OnboardingItemStatus[];
}

/**
 * Har bandning holati.
 *
 * `auto` bandlar HAR SAFAR qaytadan tekshiriladi: bir marta «bajarilgan» deb
 * yozib qo'yish keyin olib qo'yilgan rolni ko'rinmas qilardi.
 */
export function onboardingProgress(
  facts: OnboardingAutoFacts,
  manual: OnboardingManualState,
): OnboardingProgress {
  const items = ONBOARDING_ITEMS.map<OnboardingItemStatus>((def) => {
    if (def.kind === ITEM_KIND.auto) {
      const { done, detail } = autoStatus(def.key, facts);
      return { ...def, done, detail, doneAt: null };
    }
    const m = manual[def.key];
    return { ...def, done: !!m, detail: null, doneAt: m?.doneAt ?? null };
  });
  const blockers = items.filter((i) => i.blocking && !i.done);
  return {
    items,
    doneCount: items.filter((i) => i.done).length,
    total: items.length,
    canPass: blockers.length === 0,
    blockers,
  };
}

function autoStatus(
  key: OnboardingItemKey,
  f: OnboardingAutoFacts,
): { done: boolean; detail: string | null } {
  switch (key) {
    case ONBOARDING_ITEM.credentialsIssued:
      return { done: f.hasPassword, detail: f.hasPassword ? null : 'parol o`rnatilmagan' };
    case ONBOARDING_ITEM.rolesAssigned:
      return { done: f.roleCount > 0, detail: f.roleCount > 0 ? null : 'rol berilmagan' };
    case ONBOARDING_ITEM.kpiProfileAssigned:
      return { done: f.hasKpiProfile, detail: f.hasKpiProfile ? null : 'profil topilmadi' };
    case ONBOARDING_ITEM.telegramBound:
      return {
        done: f.telegramChatId !== null,
        detail: f.telegramChatId !== null ? null : 'ulanmagan',
      };
    default:
      return { done: false, detail: null };
  }
}

/**
 * Xodimga KPI profili yechiladimi.
 *
 * Tanlash tartibi `EmployeeDailyKpiService.resolveProfileVersions` bilan BIR
 * XIL: **xodim → lavozim → sukut**. Ikki joyda ikki xil qoida bo'lsa, ro'yxat
 * «profil bor» derdi-yu kunlik hisob uni topmasdi (yoki teskarisi), va sinovni
 * yopib bo'lmagan xodimning sababi tushunarsiz qolardi.
 */
export function hasResolvableKpiProfile(
  profiles: ReadonlyArray<{ employeeId: string | null; positionId: string | null }>,
  emp: { id: string; positionId: string | null },
): boolean {
  for (const p of profiles) {
    if (p.employeeId === emp.id) return true;
  }
  for (const p of profiles) {
    if (p.employeeId === null && p.positionId !== null && p.positionId === emp.positionId) {
      return true;
    }
  }
  // Sukut profil (lavozimsiz, xodimsiz) — hammaga yaraydi.
  return profiles.some((p) => p.employeeId === null && p.positionId === null);
}

// ── Sinov muddati va baholash sanasi ─────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Baholash sanasigacha necha kun qolganda ogohlantirish boshlanadi.
 *
 * ⚠️ TZ'da bu raqam YO'Q — tanlangan qiymat (7 kun = bir ish haftasi:
 * menejer qaror uchun suhbat tayinlashga ulguradi). Egasi boshqa qiymat
 * xohlasa shu yagona joyda o'zgaradi.
 */
export const EVALUATION_WARN_DAYS = 7;

export const PROBATION_STATE = {
  /** Sinov sanasi belgilanmagan — ogohlantiradigan narsa yo'q. */
  none: 'none',
  inProbation: 'in_probation',
  dueSoon: 'due_soon',
  due: 'due',
  /** Sana o'tib ketgan, natija hamon belgilanmagan — «unutildi». */
  overdue: 'overdue',
  passed: 'passed',
  failed: 'failed',
} as const;

export type ProbationState = (typeof PROBATION_STATE)[keyof typeof PROBATION_STATE];

export const PROBATION_OUTCOME = {
  passed: 'passed',
  failed: 'failed',
} as const;

export type ProbationOutcome = (typeof PROBATION_OUTCOME)[keyof typeof PROBATION_OUTCOME];

export function isProbationOutcome(v: unknown): v is ProbationOutcome {
  return v === PROBATION_OUTCOME.passed || v === PROBATION_OUTCOME.failed;
}

/**
 * Instantdan Toshkent **kalendar kuni**, `@db.Date` bilan bir xil ko'rinishda
 * (UTC yarim tun yorlig'i).
 *
 * ⚠️ Yorliq va instant aralashtirilmaydi: sinov sanalari DATE ustunlar, ya'ni
 * ular allaqachon yorliq. Xom UTC bilan solishtirilsa Toshkentda soat 19:00
 * dan keyin kun bir kunga oldinga sakrab, ogohlantirish bir kun erta otilardi.
 */
export function dateLabel(instant: Date): Date {
  return new Date(Math.floor((instant.getTime() + TASHKENT_OFFSET_MS) / DAY_MS) * DAY_MS);
}

/** DATE ustun qiymatini yorliqqa keltirish (vaqt qismi bo'lsa kesiladi). */
function toLabel(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);
}

export interface ProbationFacts {
  probationEndsOn: Date | null;
  evaluationOn: Date | null;
  outcome: string | null;
}

export interface ProbationStatus {
  state: ProbationState;
  /** Amaldagi baholash sanasi: `evaluationOn` ?? `probationEndsOn`. */
  evaluationDate: Date | null;
  /** Baholashgacha qolgan kun; manfiy = kechikkan. NULL = sana yo'q. */
  daysLeft: number | null;
  /** Menejer ekranida ogohlantirish ko'rsatiladimi. */
  warn: boolean;
}

/**
 * Sinov holati.
 *
 * Natija belgilangach ogohlantirish **to'xtaydi** — kechikkan kun uchun
 * abadiy qizil bayroq menejer ekranini ishlatib bo'lmas holga keltirardi.
 */
export function probationStatus(facts: ProbationFacts, now: Date): ProbationStatus {
  const raw = facts.evaluationOn ?? facts.probationEndsOn;
  const evaluationDate = raw ? toLabel(raw) : null;

  if (facts.outcome === PROBATION_OUTCOME.passed || facts.outcome === PROBATION_OUTCOME.failed) {
    return {
      state:
        facts.outcome === PROBATION_OUTCOME.passed
          ? PROBATION_STATE.passed
          : PROBATION_STATE.failed,
      evaluationDate,
      daysLeft: null,
      warn: false,
    };
  }

  if (!evaluationDate) {
    return { state: PROBATION_STATE.none, evaluationDate: null, daysLeft: null, warn: false };
  }

  const daysLeft = Math.round((evaluationDate.getTime() - dateLabel(now).getTime()) / DAY_MS);
  const state =
    daysLeft < 0
      ? PROBATION_STATE.overdue
      : daysLeft === 0
        ? PROBATION_STATE.due
        : daysLeft <= EVALUATION_WARN_DAYS
          ? PROBATION_STATE.dueSoon
          : PROBATION_STATE.inProbation;

  return { state, evaluationDate, daysLeft, warn: state !== PROBATION_STATE.inProbation };
}

// ── Hayot sikli ──────────────────────────────────────────────────────────────

export const LIFECYCLE_STAGE = {
  probation: 'probation',
  /** Sinovdan o'tmadi, lekin hali bo'shatilmagan — javobsiz qolmasligi kerak. */
  probationFailed: 'probation_failed',
  active: 'active',
  offboarding: 'offboarding',
  archived: 'archived',
} as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGE)[keyof typeof LIFECYCLE_STAGE];

/**
 * TZ §6.3 dagi uch bosqich (+ ikki oraliq holat).
 *
 * Tartib muhim: arxivlangan → bo'shatilmoqda → sinov. Bo'shatish sinovdan
 * USTUN, chunki sinovdan o'tmagan odam ham bo'shatish ro'yxatidan o'tishi
 * shart va ekranda aynan o'sha ro'yxat ko'rinishi kerak.
 *
 * Onboarding qatori YO'Q xodim `active` — backfill qilinmaydi, aks holda
 * butun mavjud jamoa bir kechada «sinovda» bo'lib qolardi.
 */
export function lifecycleStage(input: {
  archived: boolean;
  offboardingStarted: boolean;
  onboardingStarted: boolean;
  probationOutcome: string | null;
}): LifecycleStage {
  if (input.archived) return LIFECYCLE_STAGE.archived;
  if (input.offboardingStarted) return LIFECYCLE_STAGE.offboarding;
  if (!input.onboardingStarted) return LIFECYCLE_STAGE.active;
  if (input.probationOutcome === PROBATION_OUTCOME.failed) return LIFECYCLE_STAGE.probationFailed;
  if (input.probationOutcome === PROBATION_OUTCOME.passed) return LIFECYCLE_STAGE.active;
  return LIFECYCLE_STAGE.probation;
}
