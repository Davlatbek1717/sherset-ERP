import { describe, expect, it } from 'vitest';
import {
  type EmployeeTargetRow,
  type KpiTargetRow,
  MANUAL_DONE_UNIT,
  TARGET_PERIOD,
  TARGET_SCOPE,
  type TargetSubject,
  manualDailyOutcome,
  resolveDailyTargets,
  resolveDailyWeights,
  resolveEmployeeTargets,
  resolveTargets,
  weekdayBit,
} from './kpi-target.js';

/**
 * MK13 / 4M TZ §2.5 — kunlik/haftalik maqsad qatlami.
 *
 * Qamrov: (1) aniqroq qamrov (xodim > lavozim > hisob) g'olib; (2) kun-turi
 * maskasi (dam olish/bayram target'ga ta'sir qiladi — §2.5); (3) haftalik
 * maqsad kunga JIMGINA bo'linmaydi; (4) tanlov DETERMINIST.
 */

const ACCOUNT = 'acc-1';
const EMPLOYEE = 'emp-1';
const POSITION = 'pos-1';
const DEPARTMENT = 'dep-1';

const subject: TargetSubject = {
  accountId: ACCOUNT,
  employeeId: EMPLOYEE,
  positionId: POSITION,
  departmentId: DEPARTMENT,
};

function target(over: Partial<KpiTargetRow> & { id: string }): KpiTargetRow {
  return {
    metricKey: 'cash_revenue',
    scope: TARGET_SCOPE.account,
    scopeRef: ACCOUNT,
    period: TARGET_PERIOD.daily,
    targetValue: 1_000_000n,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    weekdayMask: 127,
    archived: false,
    ...over,
  };
}

// 2026-08-10 = dushanba, 2026-08-15 = shanba, 2026-08-16 = yakshanba.
const MONDAY = '2026-08-10';
const SATURDAY = '2026-08-15';

describe('weekdayBit — sana YORLIG`Idan hafta kuni (tz-siz)', () => {
  it('dushanba = 1, yakshanba = 64', () => {
    expect(weekdayBit(MONDAY)).toBe(1);
    expect(weekdayBit('2026-08-16')).toBe(64);
  });

  it('shanba = 32', () => {
    expect(weekdayBit(SATURDAY)).toBe(32);
  });
});

describe('resolveTargets — qamrov aniqligi', () => {
  it('xodim maqsadi lavozim va hisob maqsadidan ustun', () => {
    const rows = [
      target({ id: 'a', scope: TARGET_SCOPE.account, scopeRef: ACCOUNT, targetValue: 100n }),
      target({ id: 'p', scope: TARGET_SCOPE.position, scopeRef: POSITION, targetValue: 200n }),
      target({ id: 'e', scope: TARGET_SCOPE.employee, scopeRef: EMPLOYEE, targetValue: 300n }),
    ];
    const r = resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue');
    expect(r?.value).toBe(300n);
    expect(r?.rowId).toBe('e');
    expect(r?.scope).toBe(TARGET_SCOPE.employee);
  });

  it('lavozim maqsadi hisob maqsadidan ustun', () => {
    const rows = [
      target({ id: 'a', targetValue: 100n }),
      target({ id: 'p', scope: TARGET_SCOPE.position, scopeRef: POSITION, targetValue: 200n }),
    ];
    expect(
      resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue')?.value,
    ).toBe(200n);
  });

  it('BOSHQA xodim/lavozim qatori olinmaydi', () => {
    const rows = [
      target({ id: 'x', scope: TARGET_SCOPE.employee, scopeRef: 'emp-2', targetValue: 999n }),
      target({ id: 'y', scope: TARGET_SCOPE.position, scopeRef: 'pos-2', targetValue: 888n }),
    ];
    expect(resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).size).toBe(0);
  });

  it('lavozimsiz xodim uchun lavozim qatori olinmaydi', () => {
    const rows = [target({ id: 'p', scope: TARGET_SCOPE.position, scopeRef: POSITION })];
    const noPos: TargetSubject = { ...subject, positionId: null };
    expect(resolveTargets(rows, noPos, MONDAY, TARGET_PERIOD.daily).size).toBe(0);
  });
});

/**
 * 🔴 MK22 — kaskad o'qi **ega → bo'lim → xodim**. `department` (bo'lim) qamrovi
 * MK13'da yo'q edi: faqat `account`/`position`/`employee` bor edi, ya'ni
 * kaskadning o'rta pog'onasi umuman saqlanmasdi.
 *
 * **Nega bo'lim lavozimdan ustun** (`SCOPE_RANK`): bo'lim maqsadi — egadan
 * pastga TAQSIMLANGAN majburiyat (kaskadning o'zi), lavozim maqsadi esa rolga
 * qo'yilgan umumiy sukut. Taqsimlangan majburiyat sukutni yengishi kerak, aks
 * holda kaskad o'z ta'sirini yo'qotadi. Xodim > bo'lim > lavozim > hisob
 * tartibidagi MAVJUD nisbatlar (xodim eng yuqori, hisob eng past) o'zgarmaydi.
 */
describe('resolveTargets — bo`lim (department) qamrovi · MK22 kaskad o`qi', () => {
  it('bo`lim qatori o`sha bo`lim xodimiga qo`llanadi', () => {
    const rows = [
      target({ id: 'd', scope: TARGET_SCOPE.department, scopeRef: DEPARTMENT, targetValue: 250n }),
    ];
    const r = resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue');
    expect(r?.value).toBe(250n);
    expect(r?.scope).toBe(TARGET_SCOPE.department);
  });

  it('BOSHQA bo`lim qatori olinmaydi', () => {
    const rows = [target({ id: 'd2', scope: TARGET_SCOPE.department, scopeRef: 'dep-2' })];
    expect(resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).size).toBe(0);
  });

  it('bo`limsiz xodim uchun bo`lim qatori olinmaydi (jimgina qo`llanmaydi)', () => {
    const rows = [target({ id: 'd', scope: TARGET_SCOPE.department, scopeRef: DEPARTMENT })];
    const noDep: TargetSubject = { ...subject, departmentId: null };
    expect(resolveTargets(rows, noDep, MONDAY, TARGET_PERIOD.daily).size).toBe(0);
  });

  it('bo`lim lavozimni yengadi, xodim bo`limni yengadi, bo`lim hisobni yengadi', () => {
    const rows = [
      target({ id: 'a', scope: TARGET_SCOPE.account, scopeRef: ACCOUNT, targetValue: 100n }),
      target({ id: 'p', scope: TARGET_SCOPE.position, scopeRef: POSITION, targetValue: 200n }),
      target({ id: 'd', scope: TARGET_SCOPE.department, scopeRef: DEPARTMENT, targetValue: 250n }),
    ];
    expect(
      resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue')?.rowId,
    ).toBe('d');

    const withEmployee = [
      ...rows,
      target({ id: 'e', scope: TARGET_SCOPE.employee, scopeRef: EMPLOYEE, targetValue: 300n }),
    ];
    expect(
      resolveTargets(withEmployee, subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue')?.rowId,
    ).toBe('e');
  });
});

describe('resolveTargets — amal qilish oynasi va kun turi', () => {
  it('oyna boshlanmagan yoki tugagan qator olinmaydi', () => {
    const rows = [
      target({ id: 'kelajak', effectiveFrom: '2026-09-01' }),
      target({ id: 'otgan', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' }),
    ];
    expect(resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).size).toBe(0);
  });

  it('oyna chegaralari YOPIQ (from va to kunlari kiradi)', () => {
    const rows = [target({ id: 'a', effectiveFrom: MONDAY, effectiveTo: MONDAY })];
    expect(resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).size).toBe(1);
  });

  it('kun maskasiga tushmagan qator olinmaydi (§2.5 kun turi)', () => {
    // Faqat ish kunlari (Du–Ju = 1+2+4+8+16 = 31) uchun qo'yilgan maqsad.
    const rows = [target({ id: 'ish-kuni', weekdayMask: 31 })];
    expect(resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).size).toBe(1);
    expect(resolveTargets(rows, subject, SATURDAY, TARGET_PERIOD.daily).size).toBe(0);
  });

  it('TOR maska keng maskadan ustun (bayram qoidasi kundalikni yengadi)', () => {
    const rows = [
      target({ id: 'har-kun', weekdayMask: 127, targetValue: 1000n }),
      target({ id: 'shanba', weekdayMask: 32, targetValue: 400n, effectiveFrom: '2026-01-01' }),
    ];
    const sat = resolveTargets(rows, subject, SATURDAY, TARGET_PERIOD.daily).get('cash_revenue');
    expect(sat?.value).toBe(400n);
    expect(sat?.rowId).toBe('shanba');

    // Dushanbada tor qoida tushmaydi — kundalik amal qiladi.
    expect(
      resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue')?.value,
    ).toBe(1000n);
  });

  it('arxivlangan qator olinmaydi', () => {
    expect(
      resolveTargets([target({ id: 'a', archived: true })], subject, MONDAY, TARGET_PERIOD.daily)
        .size,
    ).toBe(0);
  });
});

describe('resolveTargets — DETERMINIZM', () => {
  it('bir xil qamrov va maskada KEYINGI `effectiveFrom` g`olib', () => {
    const rows = [
      target({ id: 'eski', effectiveFrom: '2026-01-01', targetValue: 100n }),
      target({ id: 'yangi', effectiveFrom: '2026-08-01', targetValue: 200n }),
    ];
    expect(
      resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue')?.rowId,
    ).toBe('yangi');
  });

  it('hamma narsa teng bo`lsa `id` bo`yicha barqaror tanlov (kirish tartibi ta`sir qilmaydi)', () => {
    const a = target({ id: 'aaa', targetValue: 100n });
    const b = target({ id: 'bbb', targetValue: 200n });
    const first = resolveTargets([a, b], subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue');
    const second = resolveTargets([b, a], subject, MONDAY, TARGET_PERIOD.daily).get('cash_revenue');
    expect(first?.rowId).toBe('aaa');
    expect(second?.rowId).toBe('aaa');
  });
});

describe('resolveTargets — haftalik maqsad kunga BO`LINMAYDI', () => {
  it('haftalik qator kunlik so`rovda qaytmaydi', () => {
    const rows = [target({ id: 'w', period: TARGET_PERIOD.weekly, targetValue: 7_000_000n })];
    expect(resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.daily).size).toBe(0);
    // Saqlanadi va haftalik so'rovda ko'rinadi — MK22 kaskadi shuni taqsimlaydi.
    expect(
      resolveTargets(rows, subject, MONDAY, TARGET_PERIOD.weekly).get('cash_revenue')?.value,
    ).toBe(7_000_000n);
  });
});

describe('resolveDailyTargets — profil maqsadi bilan birlashishi', () => {
  const profile = new Map<string, bigint | null>([
    ['cash_revenue', 500n],
    ['late_minutes', 10n],
    ['tasks_done', null],
  ]);

  it('ustama qator bo`lmasa profil maqsadi ishlatiladi', () => {
    const r = resolveDailyTargets([], subject, MONDAY, profile);
    expect(r.get('cash_revenue')).toEqual({
      metricKey: 'cash_revenue',
      value: 500n,
      source: 'profile',
      rowId: null,
      scope: null,
    });
  });

  it('ustama qator profil maqsadini almashtiradi', () => {
    const r = resolveDailyTargets(
      [target({ id: 'e2', targetValue: 900n })],
      subject,
      MONDAY,
      profile,
    );
    expect(r.get('cash_revenue')?.value).toBe(900n);
    expect(r.get('cash_revenue')?.source).toBe('target_override');
  });

  it('profilda maqsadi YO`Q ko`rsatkich `none` bo`lib qoladi (0 EMAS)', () => {
    // 🔴 NULL ≠ 0: maqsadsiz ko'rsatkich ballanmaydi, nol maqsad deb olinmaydi.
    const r = resolveDailyTargets([], subject, MONDAY, profile);
    expect(r.get('tasks_done')).toEqual({
      metricKey: 'tasks_done',
      value: null,
      source: 'none',
      rowId: null,
      scope: null,
    });
  });

  it('profilda umuman yo`q ko`rsatkichga ustama maqsad qo`yilsa ham qaytadi', () => {
    const r = resolveDailyTargets(
      [target({ id: 'n', metricKey: 'gross_profit', targetValue: 42n })],
      subject,
      MONDAY,
      profile,
    );
    expect(r.get('gross_profit')?.value).toBe(42n);
  });

  it('har ko`rsatkich mustaqil hal qilinadi', () => {
    const r = resolveDailyTargets(
      [target({ id: 'lm', metricKey: 'late_minutes', targetValue: 0n })],
      subject,
      MONDAY,
      profile,
    );
    expect(r.get('late_minutes')?.value).toBe(0n); // nol-tolerantlik maqsadi haqiqiy qiymat
    expect(r.get('late_minutes')?.source).toBe('target_override');
    expect(r.get('cash_revenue')?.source).toBe('profile');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KPI-03 — `EmployeeKpiTarget` («biriktirilgan KPI») qatlami
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KPI-03 · reja §KPI-03.1 — yangi qatlam **eng yuqori** manba.
 *
 * Bu qatorlar `KpiTargetRow` dan farq qiladi: amal qilish oynasi ham, kun
 * maskasi ham YO'Q (versiyalanmaydi — tarix `EmployeeDailyKpiMetric` muhrida).
 * Shuning uchun ular alohida turda va alohida funksiyada hal qilinadi.
 */
function empTarget(over: Partial<EmployeeTargetRow> & { id: string }): EmployeeTargetRow {
  return {
    employeeId: EMPLOYEE,
    metricKey: 'cash_revenue',
    period: TARGET_PERIOD.daily,
    targetValue: 777n,
    // KPI-05: sukut bo'yicha OG'IRLIKSIZ — «todo kabi qo'shildi, ballanmaydi».
    weight: null,
    manualDoneDate: null,
    active: true,
    ...over,
  };
}

describe('resolveEmployeeTargets — biriktirilgan KPI qatori', () => {
  it('o`sha xodimning FAOL kunlik qatori qaytadi', () => {
    const r = resolveEmployeeTargets([empTarget({ id: 't1' })], EMPLOYEE, TARGET_PERIOD.daily);
    expect(r.get('cash_revenue')).toEqual({
      metricKey: 'cash_revenue',
      value: 777n,
      source: 'employee_target',
      rowId: 't1',
      scope: TARGET_SCOPE.employee,
    });
  });

  it('BOSHQA xodimning qatori olinmaydi', () => {
    const rows = [empTarget({ id: 'x', employeeId: 'emp-2' })];
    expect(resolveEmployeeTargets(rows, EMPLOYEE, TARGET_PERIOD.daily).size).toBe(0);
  });

  it('arxivlangan (`active: false`) qator olinmaydi', () => {
    const rows = [empTarget({ id: 'a', active: false })];
    expect(resolveEmployeeTargets(rows, EMPLOYEE, TARGET_PERIOD.daily).size).toBe(0);
  });

  it('RAQAMSIZ maqsad (`targetValue: null`) qaytadi — «yo`q» EMAS', () => {
    // 🔴 NULL ≠ «qator yo'q»: raqamsiz «todo» ham biriktirilgan KPI, va u
    // profil maqsadini ALMASHTIRADI. Aks holda menejer raqamsiz KPI qo'yganda
    // eski profil raqami jimgina qaytib kelardi.
    const r = resolveEmployeeTargets(
      [empTarget({ id: 'n', targetValue: null })],
      EMPLOYEE,
      TARGET_PERIOD.daily,
    );
    expect(r.get('cash_revenue')).toMatchObject({ value: null, source: 'employee_target' });
  });

  it('hammasi teng bo`lsa `id` bo`yicha BARQAROR tanlov', () => {
    const a = empTarget({ id: 'aaa', targetValue: 100n });
    const b = empTarget({ id: 'bbb', targetValue: 200n });
    expect(
      resolveEmployeeTargets([a, b], EMPLOYEE, TARGET_PERIOD.daily).get('cash_revenue')?.rowId,
    ).toBe('aaa');
    expect(
      resolveEmployeeTargets([b, a], EMPLOYEE, TARGET_PERIOD.daily).get('cash_revenue')?.rowId,
    ).toBe('aaa');
  });
});

describe('resolveEmployeeTargets — haftalik/oylik KUNGA BO`LINMAYDI (reja §KPI-03.3)', () => {
  it('haftalik qator kunlik so`rovda qaytmaydi', () => {
    const rows = [empTarget({ id: 'w', period: TARGET_PERIOD.weekly, targetValue: 7_000_000n })];
    expect(resolveEmployeeTargets(rows, EMPLOYEE, TARGET_PERIOD.daily).size).toBe(0);
    expect(
      resolveEmployeeTargets(rows, EMPLOYEE, TARGET_PERIOD.weekly).get('cash_revenue')?.value,
    ).toBe(7_000_000n);
  });

  it('oylik qator ham kunlik so`rovda qaytmaydi', () => {
    const rows = [empTarget({ id: 'm', period: TARGET_PERIOD.monthly, targetValue: 30_000_000n })];
    expect(resolveEmployeeTargets(rows, EMPLOYEE, TARGET_PERIOD.daily).size).toBe(0);
    expect(
      resolveEmployeeTargets(rows, EMPLOYEE, TARGET_PERIOD.monthly).get('cash_revenue')?.value,
    ).toBe(30_000_000n);
  });
});

describe('resolveDailyTargets — biriktirilgan KPI eng yuqori manba', () => {
  const profile = new Map<string, bigint | null>([['cash_revenue', 500n]]);

  it('biriktirilgan KPI profil maqsadini yengadi', () => {
    const r = resolveDailyTargets([], subject, MONDAY, profile, [empTarget({ id: 'e1' })]);
    expect(r.get('cash_revenue')).toMatchObject({
      value: 777n,
      source: 'employee_target',
      rowId: 'e1',
    });
  });

  it('biriktirilgan KPI `KpiTarget` ustamasini ham yengadi (eng yuqori pog`ona)', () => {
    // Xodim qamrovidagi eski MK13 qatori bilan to'qnashuv — yangi qatlam ustun.
    const legacy = target({
      id: 'ov',
      scope: TARGET_SCOPE.employee,
      scopeRef: EMPLOYEE,
      targetValue: 900n,
    });
    const r = resolveDailyTargets([legacy], subject, MONDAY, profile, [empTarget({ id: 'e1' })]);
    expect(r.get('cash_revenue')?.value).toBe(777n);
    expect(r.get('cash_revenue')?.source).toBe('employee_target');
  });

  it('biriktirilgan KPI yo`q ko`rsatkich eski tartibda hal qilinadi (regress)', () => {
    const r = resolveDailyTargets([], subject, MONDAY, profile, [
      empTarget({ id: 'e1', metricKey: 'tasks_done' }),
    ]);
    expect(r.get('cash_revenue')).toMatchObject({ value: 500n, source: 'profile' });
    expect(r.get('tasks_done')).toMatchObject({ value: 777n, source: 'employee_target' });
  });

  it('RAQAMSIZ biriktirilgan KPI profil raqamini QAYTARIB kelmaydi', () => {
    const r = resolveDailyTargets([], subject, MONDAY, profile, [
      empTarget({ id: 'e1', targetValue: null }),
    ]);
    expect(r.get('cash_revenue')).toMatchObject({ value: null, source: 'employee_target' });
  });

  it('haftalik biriktirilgan KPI kunlik maqsadga aralashmaydi', () => {
    const r = resolveDailyTargets([], subject, MONDAY, profile, [
      empTarget({ id: 'w', period: TARGET_PERIOD.weekly, targetValue: 7_000_000n }),
    ]);
    expect(r.get('cash_revenue')).toMatchObject({ value: 500n, source: 'profile' });
  });
});

/**
 * KPI-03 §4 — QO'LDA (o'lchanmaydigan) metrikaning fakti `manualDoneAt` dan.
 *
 * Dvigatel bunday ko'rsatkichni hisoblay olmaydi, shuning uchun fakt yagona
 * manbadan — menejerning «bajarildi» belgisidan — keladi. Belgi **kun
 * yorlig'iga** taqqoslanadi (instant emas): aks holda bugun belgilangan KPI
 * butun tarixni «bajarildi» qilib yozardi.
 */
describe('manualDailyOutcome — qo`lda metrika fakti', () => {
  it('shu kunda belgilangan → fakt = maqsad (bajarish 100%)', () => {
    const o = manualDailyOutcome(
      empTarget({ id: 'm', targetValue: 5n, manualDoneDate: MONDAY }),
      MONDAY,
    );
    expect(o).toEqual({ fact: 5n, target: 5n });
  });

  it('belgilanmagan → fakt 0, maqsad saqlanadi (bajarish 0%)', () => {
    const o = manualDailyOutcome(empTarget({ id: 'm', targetValue: 5n }), MONDAY);
    expect(o).toEqual({ fact: 0n, target: 5n });
  });

  it('BOSHQA kunda belgilangan → shu kun uchun 0 (tarix qayta yozilmaydi)', () => {
    const o = manualDailyOutcome(
      empTarget({ id: 'm', targetValue: 5n, manualDoneDate: SATURDAY }),
      MONDAY,
    );
    expect(o.fact).toBe(0n);
  });

  it('RAQAMSIZ «todo» birlik maqsad oladi — aks holda ballanmay qolardi', () => {
    // Maqsad NULL bo'lsa `kpi-score.ts` uni `no_target` deb tashlab yuborardi,
    // ya'ni «bajarildi» belgisi hech qachon ballga aylanmasdi.
    const numberless = { id: 'm', targetValue: null };
    expect(
      manualDailyOutcome(empTarget({ ...numberless, manualDoneDate: MONDAY }), MONDAY),
    ).toEqual({ fact: MANUAL_DONE_UNIT, target: MANUAL_DONE_UNIT });
    expect(manualDailyOutcome(empTarget(numberless), MONDAY)).toEqual({
      fact: 0n,
      target: MANUAL_DONE_UNIT,
    });
  });
});

/**
 * KPI-05 — OG'IRLIK POG'ONASI.
 *
 * Og'irlik ham maqsad kabi ikki manbadan kelishi mumkin: biriktirilgan KPI
 * qatori (`EmployeeKpiTarget.weight`) va profil versiyasi
 * (`KpiProfileMetric.weight`). Ustuvorlik MAQSAD bilan BIR XIL bo'lishi shart —
 * aks holda bitta ko'rsatkichning maqsadi bir qatordan, og'irligi boshqasidan
 * olinib, ekrандagi raqam hech qaysi sozlamaga mos kelmasdi.
 */
describe('resolveDailyWeights — og`irlik pog`onasi (KPI-05)', () => {
  it('biriktirilgan qator og`irligi profilnikidan USTUN', () => {
    const w = resolveDailyWeights(
      [empTarget({ id: 'e1', weight: 40 })],
      EMPLOYEE,
      new Map([['cash_revenue', 70]]),
    );
    expect(w.get('cash_revenue')).toEqual({
      metricKey: 'cash_revenue',
      value: 40,
      source: 'employee_target',
    });
  });

  it('🔴 biriktirilgan qatorda og`irlik NULL bo`lsa ham USTUN — profilga TUSHMAYDI', () => {
    // Menejer KPI'ni ataylab ballsiz qo'ydi. Profildagi eski og'irlik uni
    // jimgina qaytarib ballasa, «og'irlik ixtiyoriy» va'dasi buzilardi.
    const w = resolveDailyWeights(
      [empTarget({ id: 'e1', weight: null })],
      EMPLOYEE,
      new Map([['cash_revenue', 70]]),
    );
    expect(w.get('cash_revenue')).toEqual({
      metricKey: 'cash_revenue',
      value: null,
      source: 'employee_target',
    });
  });

  it('biriktirilmagan ko`rsatkich profil og`irligini oladi', () => {
    const w = resolveDailyWeights([], EMPLOYEE, new Map([['late_minutes', 30]]));
    expect(w.get('late_minutes')).toEqual({
      metricKey: 'late_minutes',
      value: 30,
      source: 'profile',
    });
  });

  it('hech bir pog`onada yo`q ko`rsatkich umuman qaytmaydi', () => {
    const w = resolveDailyWeights([], EMPLOYEE, new Map());
    expect(w.has('cash_revenue')).toBe(false);
  });

  it('haftalik/oylik qator KUNLIK og`irlikka ta`sir qilmaydi', () => {
    // §KPI-03.3 bilan bir xil qoida: haftalik qator kunlik ballga kirmaydi,
    // demak uning og'irligi ham kunlik ballga tushmasligi kerak.
    const w = resolveDailyWeights(
      [empTarget({ id: 'e1', period: TARGET_PERIOD.weekly, weight: 40 })],
      EMPLOYEE,
      new Map([['cash_revenue', 70]]),
    );
    expect(w.get('cash_revenue')).toEqual({
      metricKey: 'cash_revenue',
      value: 70,
      source: 'profile',
    });
  });

  it('arxivlangan (active=false) qator og`irlik bermaydi', () => {
    const w = resolveDailyWeights(
      [empTarget({ id: 'e1', weight: 40, active: false })],
      EMPLOYEE,
      new Map([['cash_revenue', 70]]),
    );
    expect(w.get('cash_revenue')?.source).toBe('profile');
  });

  it('boshqa xodimning qatori tegmaydi', () => {
    const w = resolveDailyWeights(
      [empTarget({ id: 'e1', employeeId: 'emp-2', weight: 40 })],
      EMPLOYEE,
      new Map([['cash_revenue', 70]]),
    );
    expect(w.get('cash_revenue')?.value).toBe(70);
  });

  it('MAQSAD bilan BIR XIL qatorni tanlaydi (ikki manba ajralib ketmaydi)', () => {
    const rows = [
      empTarget({ id: 'a2', targetValue: 200n, weight: 20 }),
      empTarget({ id: 'a1', targetValue: 100n, weight: 10 }),
    ];
    const t = resolveEmployeeTargets(rows, EMPLOYEE, TARGET_PERIOD.daily);
    const w = resolveDailyWeights(rows, EMPLOYEE, new Map());
    expect(t.get('cash_revenue')?.rowId).toBe('a1');
    expect(w.get('cash_revenue')?.value).toBe(10); // aynan o'sha qatorniki
  });
});
