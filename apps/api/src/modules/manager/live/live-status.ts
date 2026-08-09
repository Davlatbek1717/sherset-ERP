/**
 * Menejerning JONLI HOLAT ekrani (menejer TZ 4M.4, M-Q10).
 *
 * Savol: «hozir kim nima qilyapti» — kim smena ochgan, kim kechikkan,
 * qaysi haydovchi yo'lda, omborchi nima yig'yapti.
 *
 * ⚠️ **ASOSIY QAROR: bu ekran «hammasi joyida» demaydi.** U faqat DIQQAT
 * TALAB QILADIGAN qatorlarni yuqoriga chiqaradi. Hamma xodimni ro'yxatlash
 * menejerni har kuni 40 qatordan 3 tasini qidirishga majbur qilardi va u
 * ekranni ochishni tashlab qo'yardi.
 *
 * Sof modul — tartiblash va «diqqat» qoidalari DB'siz sinaladi.
 */

/** Qator qanchalik diqqat talab qiladi. */
export const ATTENTION = {
  /** Aralashuv kerak: kechikish, uzoq ochiq smena, qotib qolgan yig'ish. */
  alert: 'alert',
  /** Ko'z tashlash kifoya. */
  info: 'info',
  /** Normal ish — ro'yxatda faqat kontekst uchun. */
  ok: 'ok',
} as const;

export type Attention = (typeof ATTENTION)[keyof typeof ATTENTION];

export const LIVE_KIND = {
  shift: 'shift',
  attendance: 'attendance',
  trip: 'trip',
  picking: 'picking',
} as const;

export type LiveKind = (typeof LIVE_KIND)[keyof typeof LIVE_KIND];

/**
 * Sarlavha KALITI — ekran matni serverda yopilmaydi (MK03).
 *
 * Quyidagi `title`/`detail` maydonlari o'zbekcha TAYYOR qator qaytaradi.
 * Ular saqlanadi (UI-bo'lmagan iste'molchilar: log, kelajakdagi Telegram
 * xulosasi), lekin **FE ularni ishlatmaydi**: ru interfeysda o'zbekcha matn
 * turib qolardi va hech bir gate buni ko'rmasdi — i18n gate faqat FE
 * fayllarini skanlaydi, BE stringlarini emas. Shuning uchun har qator
 * tarjima uchun struktura ham beradi: kalit + parametrlar.
 */
export const LIVE_TITLE = {
  shiftOpen: 'shift_open',
  shiftOpenDesk: 'shift_open_desk',
  attendanceLate: 'attendance_late',
  attendanceOnTime: 'attendance_on_time',
  tripAssigned: 'trip_assigned',
  tripEnroute: 'trip_enroute',
  tripArrived: 'trip_arrived',
  picking: 'picking',
} as const;

export type LiveTitleKey = (typeof LIVE_TITLE)[keyof typeof LIVE_TITLE];

export interface LiveRow {
  kind: LiveKind;
  employeeId: string | null;
  employeeName: string | null;
  /** Bir qatorlik holat matni — menejer birinchi shuni o'qiydi. */
  title: string;
  /** `title` ning tarjima qilinadigan ekvivalenti (FE shuni chizadi). */
  titleKey: LiveTitleKey;
  /** Kalit o'rinbosarlari — kassa nomi, kechikish daqiqasi, hujjat raqami. */
  titleParams: Record<string, string | number>;
  detail: string | null;
  /**
   * Joy/manzil — detal qatorining TARJIMASIZ qismi (faqat reysda bo'ladi).
   * Tarjima kerak emas: bu foydalanuvchi kiritgan manzil matni.
   */
  place: string | null;
  /** Detalda davomiylik ko'rsatiladimi (mijoz `since` dan o'zi hisoblaydi). */
  showDuration: boolean;
  attention: Attention;
  /** Boshlangan payt — «qancha vaqtdan beri» shundan hisoblanadi. */
  since: Date | null;
}

// ── Chegaralar ───────────────────────────────────────────────────────────────

/**
 * Smena shuncha soatdan uzoq ochiq turса — diqqat.
 *
 * 12 soat: odatiy smena 8–10 soat, 12 dan oshgani deyarli har doim
 * «yopishni unutdi» degani. Pastroq qo'yilsa (masalan 9) uzun kunlarda
 * har smena ogohlantirishga aylanardi va signal qadrsizlanardi.
 */
export const SHIFT_LONG_HOURS = 12;

/** Shuncha daqiqadan ortiq kechikish — diqqat. */
export const LATE_ALERT_MINUTES = 15;

/**
 * Yig'ish shuncha daqiqadan uzoq davom etsa — diqqat.
 *
 * 45 daqiqa: o'rtacha buyurtma 10–20 daqiqada yig'iladi. Undan uzog'i
 * odatda «omborchi boshqa ishga o'tib ketgan» yoki «tovar topilmayapti».
 */
export const PICKING_STUCK_MINUTES = 45;

function hoursSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / 3_600_000;
}

function minutesSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / 60_000;
}

/** «3 soat 20 daqiqa» — menejer raqamni emas, davomiylikni o'qiydi. */
export function durationLabel(from: Date, now: Date): string {
  const mins = Math.max(0, Math.floor(minutesSince(from, now)));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} daq`;
  return m === 0 ? `${h} soat` : `${h} soat ${m} daq`;
}

// ── Qator quruvchilar ────────────────────────────────────────────────────────

export interface OpenShiftInput {
  employeeId: string;
  employeeName: string | null;
  cashDeskName: string | null;
  openedAt: Date;
}

export function shiftRow(s: OpenShiftInput, now: Date): LiveRow {
  const long = hoursSince(s.openedAt, now) >= SHIFT_LONG_HOURS;
  return {
    kind: LIVE_KIND.shift,
    employeeId: s.employeeId,
    employeeName: s.employeeName,
    title: s.cashDeskName ? `Smena ochiq — ${s.cashDeskName}` : 'Smena ochiq',
    titleKey: s.cashDeskName ? LIVE_TITLE.shiftOpenDesk : LIVE_TITLE.shiftOpen,
    titleParams: s.cashDeskName ? { desk: s.cashDeskName } : {},
    detail: durationLabel(s.openedAt, now),
    place: null,
    showDuration: true,
    // Uzoq ochiq smena — pul javobgarligi cho'zilgani, shuning uchun alert.
    attention: long ? ATTENTION.alert : ATTENTION.ok,
    since: s.openedAt,
  };
}

export interface AttendanceInput {
  employeeId: string;
  employeeName: string | null;
  checkInTime: Date;
  lateMinutes: number;
}

export function attendanceRow(a: AttendanceInput): LiveRow {
  const late = a.lateMinutes > 0;
  return {
    kind: LIVE_KIND.attendance,
    employeeId: a.employeeId,
    employeeName: a.employeeName,
    title: late ? `Kechikdi — ${a.lateMinutes} daq` : 'Ishga keldi',
    titleKey: late ? LIVE_TITLE.attendanceLate : LIVE_TITLE.attendanceOnTime,
    titleParams: late ? { minutes: a.lateMinutes } : {},
    detail: null,
    place: null,
    // «Keldi» — bir martalik hodisa; davomiylik ko'rsatish uni «shuncha
    // vaqtdan beri kechikmoqda» deb yolg'on o'qitardi.
    showDuration: false,
    attention:
      a.lateMinutes >= LATE_ALERT_MINUTES ? ATTENTION.alert : late ? ATTENTION.info : ATTENTION.ok,
    since: a.checkInTime,
  };
}

export interface TripInput {
  driverId: string;
  driverName: string | null;
  status: string;
  destAddress: string | null;
  assignedAt: Date;
  startedAt: Date | null;
}

export function tripRow(t: TripInput, now: Date): LiveRow {
  const started = t.startedAt ?? t.assignedAt;
  return {
    kind: LIVE_KIND.trip,
    employeeId: t.driverId,
    employeeName: t.driverName,
    title:
      t.status === 'enroute' ? "Yo'lda" : t.status === 'arrived' ? 'Manzilda' : 'Biriktirilgan',
    titleKey:
      t.status === 'enroute'
        ? LIVE_TITLE.tripEnroute
        : t.status === 'arrived'
          ? LIVE_TITLE.tripArrived
          : LIVE_TITLE.tripAssigned,
    titleParams: {},
    detail: t.destAddress
      ? `${t.destAddress} · ${durationLabel(started, now)}`
      : durationLabel(started, now),
    place: t.destAddress,
    showDuration: true,
    // «Biriktirilgan» — hali yo'lga chiqmagan: shu holatda uzoq turishi
    // diqqat talab qiladi, «yo'lda» esa normal ish.
    attention:
      t.status === 'assigned' && hoursSince(t.assignedAt, now) >= 1
        ? ATTENTION.alert
        : ATTENTION.info,
    since: started,
  };
}

export interface PickingInput {
  employeeId: string | null;
  employeeName: string | null;
  docName: string;
  startedAt: Date;
}

export function pickingRow(p: PickingInput, now: Date): LiveRow {
  const stuck = minutesSince(p.startedAt, now) >= PICKING_STUCK_MINUTES;
  return {
    kind: LIVE_KIND.picking,
    employeeId: p.employeeId,
    employeeName: p.employeeName,
    title: `Yig'moqda — ${p.docName}`,
    titleKey: LIVE_TITLE.picking,
    titleParams: { doc: p.docName },
    detail: durationLabel(p.startedAt, now),
    place: null,
    showDuration: true,
    attention: stuck ? ATTENTION.alert : ATTENTION.info,
    since: p.startedAt,
  };
}

// ── Yig'ish ──────────────────────────────────────────────────────────────────

const ATTENTION_ORDER: Record<Attention, number> = {
  [ATTENTION.alert]: 0,
  [ATTENTION.info]: 1,
  [ATTENTION.ok]: 2,
};

export interface LiveBoard {
  rows: LiveRow[];
  alertCount: number;
  /** Tur bo'yicha sanoq — ekran boshidagi hisoblagichlar. */
  counts: Record<LiveKind, number>;
}

/**
 * Taxta: diqqat talab qiladigani TEPADA, keyin eng uzoq turgani.
 *
 * Ikkinchi mezon **eskiligi** bo'yicha: bir xil darajadagi ikki qatordan
 * uzoqroq turgani muhimroq — u ko'proq e'tiborsiz qolgan.
 */
export function buildLiveBoard(rows: ReadonlyArray<LiveRow>): LiveBoard {
  const sorted = [...rows].sort((a, b) => {
    const byAttention = ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention];
    if (byAttention !== 0) return byAttention;
    const at = a.since?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = b.since?.getTime() ?? Number.POSITIVE_INFINITY;
    return at - bt;
  });
  const counts: Record<LiveKind, number> = {
    [LIVE_KIND.shift]: 0,
    [LIVE_KIND.attendance]: 0,
    [LIVE_KIND.trip]: 0,
    [LIVE_KIND.picking]: 0,
  };
  for (const r of sorted) counts[r.kind] += 1;
  return {
    rows: sorted,
    alertCount: sorted.filter((r) => r.attention === ATTENTION.alert).length,
    counts,
  };
}
