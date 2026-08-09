import { describe, expect, it } from 'vitest';
import {
  type KpiTargetRow,
  TARGET_PERIOD,
  TARGET_SCOPE,
  type TargetSubject,
  resolveDailyTargets,
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
