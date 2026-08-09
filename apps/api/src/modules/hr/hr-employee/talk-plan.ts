/**
 * Rejalashtirilgan 1:1 suhbat va o'qitish rejasi (menejer TZ 4M §8.1/10 — MK23).
 *
 * MUAMMO. Suhbat jurnali (`employee-note.ts`) faqat **bo'lib o'tgan**ni yozadi:
 * menejer gaplashsa — qoladi, gaplashmasa — hech qayerda ko'rinmaydi. Amalda
 * eng qimmat holat aynan shu: xodim bilan uch oy gaplashilmagani hech kimga
 * ma'lum bo'lmaydi, chunki «bo'lmagan suhbat» hujjat qoldirmaydi. O'qitish
 * ham xuddi shunday — «o'rgatamiz» deb aytiladi, kim nimani o'rgangani esa
 * hech qayerda yo'q.
 *
 * YECHIM — **YANGI JURNAL OCHILMAYDI.** Reja ham mavjud append-only jurnalning
 * yozuvi (`EmployeeNote`), faqat boshqa `kind` bilan: `talk_plan` va
 * `training`. Natija esa o'sha rejaga **farzand yozuv** sifatida qo'shiladi
 * (`parentId`) — yopish UPDATE bilan emas, YANGI yozuv bilan bo'ladi. Shu
 * sababdan jurnalning append-only shartnomasi buzilmaydi: «bajarildi» degan
 * fakt ham, uni kim va qachon yozgani ham tarixda qoladi.
 *
 * SANA SEMANTIKASI. `dueOn` — `@db.Date` yorlig'i (UTC yarim tun), sinov
 * muddati sanalari bilan bir xil. Solishtirish `onboarding.ts` dagi
 * `dateLabel()` orqali: ikki joyda ikki xil tz qoidasi bo'lsa, Toshkentda
 * soat 19:00 dan keyin ogohlantirish bir kun sakrab ketardi.
 *
 * Sof modul — qoidalar DB'siz sinaladi.
 */

import { dateLabel } from './onboarding.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reja turlari — `EmployeeNote.kind` ning YANGI qiymatlari.
 *
 * Mavjud turlar (`talk`/`warning`/`praise`) o'z ma'nosida qoladi: ular
 * bo'lib o'tgan hodisa, bu ikkisi esa **kelajakka olingan majburiyat**.
 * Ularni bir turga qo'shish «gaplashdim» va «gaplashaman» ni farqlanmas
 * qilardi — aynan shu farq MK23 ning butun mazmuni.
 */
export const PLAN_KIND = {
  /** Rejalashtirilgan 1:1 suhbat (sana + mavzu). */
  talk: 'talk_plan',
  /** O'qitish rejasining bandi. */
  training: 'training',
} as const;

export type PlanKind = (typeof PLAN_KIND)[keyof typeof PLAN_KIND];

export function isPlanKind(v: unknown): v is PlanKind {
  return v === PLAN_KIND.talk || v === PLAN_KIND.training;
}

/**
 * Muddatidan shuncha kun oldin ogohlantirish boshlanadi.
 *
 * ⚠️ TZ'da bu raqam YO'Q — `EVALUATION_WARN_DAYS` bilan bir xil qiymat
 * (7 kun = bir ish haftasi) ataylab olindi: menejer ekranida ikki xil
 * «yaqinlashdi» chegarasi bo'lsa, bir xil ko'rinadigan ikki bayroq turli
 * kunlarda yonib, ekranga ishonch yo'qolardi.
 */
export const PLAN_WARN_DAYS = 7;

export const PLAN_STATUS = {
  /** Muddat uzoq yoki umuman belgilanmagan — ochiq turadi, shovqin qilmaydi. */
  open: 'open',
  dueSoon: 'due_soon',
  due: 'due',
  /** Muddat o'tdi, natija hamon yo'q — «o'tkazib yuborilgan». */
  overdue: 'overdue',
  /** Natija jurnalga yozilgan. */
  done: 'done',
  /** Rejadan voz kechilgan — bekor qilingan yozuv ko'rinadi, sanalmaydi. */
  voided: 'voided',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

/** Jurnaldagi reja yozuvi. */
export interface PlanRow {
  id: string;
  /** `EmployeeNote.kind` — reja bo'lmagan qiymat ham kelishi mumkin. */
  kind: string;
  /** Suhbat mavzusi / o'qitish bandi matni. */
  topic: string;
  /** Rejalashtirilgan sana (DATE yorlig'i). NULL = muddatsiz. */
  dueOn: Date | null;
  createdAt: Date;
  voidedAt: Date | null;
}

/**
 * Rejani yopadigan farzand yozuv (natija) — o'sha jurnalning qatori.
 *
 * `voidedAt` MUHIM: bekor qilingan natija rejani YOPMAYDI. Aks holda xato
 * yozilgan «o'tkazildi» ni keyin bekor qilish rejani «bajarildi» holatida
 * qoldirardi — ya'ni o'tkazilmagan suhbat jimgina yo'qolardi.
 */
export interface OutcomeRow {
  parentId: string | null;
  createdAt: Date;
  voidedAt: Date | null;
}

export interface PlanState {
  status: PlanStatus;
  /** Muddatgacha qolgan kun; manfiy = kechikkan. NULL = muddat yo'q. */
  daysLeft: number | null;
  /** Menejer ekranida/taxtada ogohlantirish ko'rsatiladimi. */
  warn: boolean;
  /** Natija yozilgan payt (yopuvchi yozuvning vaqti). */
  closedAt: Date | null;
}

/** DATE ustun qiymatini yorliqqa keltirish (vaqt qismi bo'lsa kesiladi). */
function toLabel(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);
}

/**
 * Bitta rejaning holati.
 *
 * Tartib muhim: **bekor qilish → natija → muddat**. Bekor qilingan reja
 * hech qachon ogohlantirmaydi (rejadan voz kechilgan), bajarilgan reja ham
 * ogohlantirmaydi (kechikkan kun uchun abadiy qizil bayroq ekranni
 * ishlatib bo'lmas holga keltirardi — `probationStatus` dagi bilan bir xil
 * qaror).
 */
export function planStatus(
  plan: PlanRow,
  outcomes: ReadonlyArray<OutcomeRow>,
  now: Date,
): PlanState {
  const dueLabel = plan.dueOn ? toLabel(plan.dueOn) : null;
  const daysLeft =
    dueLabel === null ? null : Math.round((dueLabel.getTime() - dateLabel(now).getTime()) / DAY_MS);

  if (plan.voidedAt !== null) {
    return { status: PLAN_STATUS.voided, daysLeft, warn: false, closedAt: null };
  }

  // Faqat KUCHDAGI (bekor qilinmagan) natija yopadi. Bir nechta bo'lsa —
  // birinchisi: reja aynan o'sha payt yopilgan.
  let closedAt: Date | null = null;
  for (const o of outcomes) {
    if (o.parentId !== plan.id || o.voidedAt !== null) continue;
    if (closedAt === null || o.createdAt < closedAt) closedAt = o.createdAt;
  }
  if (closedAt !== null) {
    return { status: PLAN_STATUS.done, daysLeft, warn: false, closedAt };
  }

  // Muddatsiz band ochiq turadi, lekin «o'tkazib yuborilgan» EMAS: o'qitish
  // bandiga sana ko'pincha qo'yilmaydi, va uni kechikkan deb ko'rsatish
  // javobgarlik taxtasini yolg'on qizilga to'ldirardi.
  if (daysLeft === null) {
    return { status: PLAN_STATUS.open, daysLeft: null, warn: false, closedAt: null };
  }

  const status =
    daysLeft < 0
      ? PLAN_STATUS.overdue
      : daysLeft === 0
        ? PLAN_STATUS.due
        : daysLeft <= PLAN_WARN_DAYS
          ? PLAN_STATUS.dueSoon
          : PLAN_STATUS.open;

  return { status, daysLeft, warn: status !== PLAN_STATUS.open, closedAt: null };
}

export interface PlanItem extends PlanState {
  id: string;
  kind: PlanKind;
  topic: string;
  dueOn: Date | null;
}

export interface PlanSummary {
  /** Yopilmagan, kechikmagan suhbatlar. */
  openTalks: number;
  overdueTalks: number;
  /** Yopilmagan o'qitish bandlari (muddatsizlar ham shu yerda). */
  openTraining: number;
  overdueTraining: number;
  /** Ogohlantiradiganlar soni (kechikkan + muddati yaqin). */
  warnCount: number;
  /** Javobgarlik taxtasi uchun yagona bayroq. */
  hasOverdue: boolean;
  /** Eng yaqin KELAYOTGAN suhbat sanasi. */
  nextTalkOn: Date | null;
  /** Eng QADIMGI o'tkazib yuborilgan sana — taxtada shu ko'rsatiladi. */
  oldestOverdueOn: Date | null;
  /** Xodim kartasi uchun ro'yxat: e'tibor talab qilgani tepada. */
  items: PlanItem[];
}

/** Ekran tartibi: kechikkan → bugun → yaqin → ochiq → bajarilgan. */
const STATUS_RANK: Record<PlanStatus, number> = {
  [PLAN_STATUS.overdue]: 0,
  [PLAN_STATUS.due]: 1,
  [PLAN_STATUS.dueSoon]: 2,
  [PLAN_STATUS.open]: 3,
  [PLAN_STATUS.done]: 4,
  [PLAN_STATUS.voided]: 5,
};

/**
 * Xodimning butun jurnalidan reja manzarasi.
 *
 * ⚠️ Kirishga jurnalning HAMMA qatori tushadi (karta bir so'rovda o'qiydi),
 * shuning uchun reja bo'lmagan turlar (`talk`/`warning`/`praise`) shu yerda
 * tashlanadi. Aks holda har bir ogohlantirish «muddatsiz ochiq band» bo'lib
 * qolardi va o'qitish sanog'i ma'nosini yo'qotardi.
 *
 * Bekor qilingan rejalar ham sanoqdan ham, ro'yxatdan ham chiqadi: ular
 * jurnalda ko'rinadi (`items`ga emas, jurnal ro'yxatiga tegishli), lekin
 * bajarilishi kutilmaydi.
 */
export function summarizePlans(
  rows: ReadonlyArray<PlanRow>,
  outcomes: ReadonlyArray<OutcomeRow>,
  now: Date,
): PlanSummary {
  const items: PlanItem[] = [];
  let openTalks = 0;
  let overdueTalks = 0;
  let openTraining = 0;
  let overdueTraining = 0;
  let warnCount = 0;
  let nextTalkOn: Date | null = null;
  let oldestOverdueOn: Date | null = null;

  for (const row of rows) {
    if (!isPlanKind(row.kind)) continue;
    const state = planStatus(row, outcomes, now);
    if (state.status === PLAN_STATUS.voided) continue;

    const isTalk = row.kind === PLAN_KIND.talk;
    const dueOn = row.dueOn ? toLabel(row.dueOn) : null;
    items.push({ ...state, id: row.id, kind: row.kind, topic: row.topic, dueOn });

    if (state.warn) warnCount += 1;

    if (state.status === PLAN_STATUS.overdue) {
      if (isTalk) overdueTalks += 1;
      else overdueTraining += 1;
      if (dueOn !== null && (oldestOverdueOn === null || dueOn < oldestOverdueOn)) {
        oldestOverdueOn = dueOn;
      }
      continue;
    }

    if (state.status === PLAN_STATUS.done) continue;

    // Qolgani — ochiq (open/due_soon/due).
    if (isTalk) {
      openTalks += 1;
      // «Keyingi suhbat» — bugun ham hisobga kiradi: bugungi suhbat hali
      // o'tkazilishi mumkin, uni o'tmish deb ko'rsatish xato bo'lardi.
      if (dueOn !== null && (nextTalkOn === null || dueOn < nextTalkOn)) nextTalkOn = dueOn;
    } else {
      openTraining += 1;
    }
  }

  items.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    // Bir xil holatda — sanasi yaqinrog'i tepada; muddatsizlar oxirida.
    if (a.dueOn === null) return b.dueOn === null ? 0 : 1;
    if (b.dueOn === null) return -1;
    return a.dueOn.getTime() - b.dueOn.getTime();
  });

  return {
    openTalks,
    overdueTalks,
    openTraining,
    overdueTraining,
    warnCount,
    hasOverdue: overdueTalks + overdueTraining > 0,
    nextTalkOn,
    oldestOverdueOn,
    items,
  };
}
