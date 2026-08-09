import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CASCADE_STATUS,
  type CascadeOrg,
  allocate,
  buildCascade,
  cascadeChangePoints,
  splitEvenly,
} from './kpi-target-cascade.js';
import { type KpiTargetRow, TARGET_PERIOD, TARGET_SCOPE } from './kpi-target.js';

/**
 * 🔴 MK22 — maqsad kaskadi (ega → bo'lim → xodim).
 *
 * Rejaning uchta testi shu yerda: (1) taqsimlanmagan qoldiq KO'RSATILADI,
 * jimgina 0 emas; (2) xodim maqsadlari yig'indisi bo'lim maqsadidan oshsa
 * ogohlantiriladi, LEKIN bloklamaydi; (3) yangi plan modeli yaratilmagan.
 *
 * Qolgan testlar — «jim yo'qolish» klassiga qarshi: bo'limsiz xodim, kaskad
 * o'qiga tushmagan qator, maqsadsiz bola, mahrajsiz foiz.
 */

const KPI_DIR = import.meta.dirname;
const SCHEMA = join(
  KPI_DIR,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'prisma',
  'schema.prisma',
);

const ACCOUNT = 'acc-1';
const DEP_A = 'dep-a';
const DEP_B = 'dep-b';
const DATE = '2026-08-10'; // dushanba

function row(over: Partial<KpiTargetRow> & { id: string }): KpiTargetRow {
  return {
    metricKey: 'cash_revenue',
    scope: TARGET_SCOPE.account,
    scopeRef: ACCOUNT,
    period: TARGET_PERIOD.daily,
    targetValue: 1_000n,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    weekdayMask: 127,
    archived: false,
    ...over,
  };
}

/** Blok va qator izohlarini olib tashlaydi — qo'riqchilar KOD ustidan ishlasin. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const org: CascadeOrg = {
  accountId: ACCOUNT,
  departments: [
    { id: DEP_A, employeeIds: ['emp-1', 'emp-2'] },
    { id: DEP_B, employeeIds: ['emp-3'] },
  ],
  unassignedEmployeeIds: ['emp-9'],
};

describe('allocate — taqsimot algebrasi (bir pog`ona)', () => {
  it('🔴 taqsimlanmagan qoldiq OCHIQ qaytadi (jimgina 0 emas)', () => {
    const r = allocate({ ref: 'p', value: 1_000n, rowId: 'r-p' }, [
      { ref: 'c1', value: 400n, rowId: 'r-1' },
      { ref: 'c2', value: 250n, rowId: 'r-2' },
    ]);
    expect(r.allocated).toBe(650n);
    expect(r.unallocated).toBe(350n);
    expect(r.status).toBe(CASCADE_STATUS.under);
    expect(r.overAllocated).toBe(0n);
  });

  it('aynan teng taqsimot `exact`, qoldiq 0n', () => {
    const r = allocate({ ref: 'p', value: 1_000n, rowId: null }, [
      { ref: 'c1', value: 600n, rowId: null },
      { ref: 'c2', value: 400n, rowId: null },
    ]);
    expect(r.status).toBe(CASCADE_STATUS.exact);
    expect(r.unallocated).toBe(0n);
  });

  it('🔴 bolalar yig`indisi otadan oshsa OGOHLANTIRADI, lekin BLOKLAMAYDI', () => {
    const r = allocate({ ref: 'p', value: 1_000n, rowId: null }, [
      { ref: 'c1', value: 700n, rowId: null },
      { ref: 'c2', value: 500n, rowId: null },
    ]);
    expect(r.status).toBe(CASCADE_STATUS.over);
    expect(r.overAllocated).toBe(200n);
    expect(r.unallocated).toBe(0n); // oshgan holatda qoldiq YO'Q — u `overAllocated` da
    expect(r.blocking).toBe(false);
    expect(r.allocatedPercent).toBe(120);
  });

  it('🔴 ota maqsadi qo`yilmagan bo`lsa qoldiq va foiz NULL (0 va 100% EMAS)', () => {
    const r = allocate({ ref: 'p', value: null, rowId: null }, [
      { ref: 'c1', value: 400n, rowId: null },
    ]);
    expect(r.status).toBe(CASCADE_STATUS.parent_not_set);
    expect(r.unallocated).toBeNull();
    expect(r.allocatedPercent).toBeNull(); // mahrajsiz ulush = null
    expect(r.allocated).toBe(400n); // bolalar baribir sanaladi
    expect(r.overAllocated).toBe(0n);
  });

  it('🔴 maqsadsiz bola 0 deb SANALMAYDI — ochiq ro`yxatga tushadi', () => {
    const r = allocate({ ref: 'p', value: 1_000n, rowId: null }, [
      { ref: 'c1', value: 400n, rowId: null },
      { ref: 'c2', value: null, rowId: null },
    ]);
    expect(r.unsetChildRefs).toEqual(['c2']);
    expect(r.allocated).toBe(400n);
    expect(r.unallocated).toBe(600n);
  });

  it('bolasiz ota — butun maqsad taqsimlanmagan', () => {
    const r = allocate({ ref: 'p', value: 1_000n, rowId: null }, []);
    expect(r.allocated).toBe(0n);
    expect(r.unallocated).toBe(1_000n);
    expect(r.status).toBe(CASCADE_STATUS.under);
    expect(r.allocatedPercent).toBe(0);
  });

  it('ota maqsadi 0 bo`lsa foiz null, lekin `parent_not_set` EMAS (0 ≠ qo`yilmagan)', () => {
    const r = allocate({ ref: 'p', value: 0n, rowId: null }, [
      { ref: 'c1', value: 5n, rowId: null },
    ]);
    expect(r.status).toBe(CASCADE_STATUS.over);
    expect(r.overAllocated).toBe(5n);
    expect(r.allocatedPercent).toBeNull(); // 0 ga bo'lish yo'q
  });
});

describe('buildCascade — ega → bo`lim → xodim', () => {
  const rows = [
    row({ id: 'acc', scope: TARGET_SCOPE.account, scopeRef: ACCOUNT, targetValue: 1_000n }),
    row({ id: 'da', scope: TARGET_SCOPE.department, scopeRef: DEP_A, targetValue: 600n }),
    row({ id: 'db', scope: TARGET_SCOPE.department, scopeRef: DEP_B, targetValue: 300n }),
    row({ id: 'e1', scope: TARGET_SCOPE.employee, scopeRef: 'emp-1', targetValue: 400n }),
    row({ id: 'e3', scope: TARGET_SCOPE.employee, scopeRef: 'emp-3', targetValue: 300n }),
  ];

  it('yuqori pog`ona: ega maqsadi bo`limlarga taqsimlanadi, qoldiq ko`rinadi', () => {
    const c = buildCascade(rows, org, {
      metricKey: 'cash_revenue',
      period: TARGET_PERIOD.daily,
      date: DATE,
    });
    expect(c.top.parentValue).toBe(1_000n);
    expect(c.top.allocated).toBe(900n);
    expect(c.top.unallocated).toBe(100n);
    expect(c.top.status).toBe(CASCADE_STATUS.under);
  });

  it('quyi pog`ona: har bo`lim o`z xodimlariga taqsimlanadi', () => {
    const c = buildCascade(rows, org, {
      metricKey: 'cash_revenue',
      period: TARGET_PERIOD.daily,
      date: DATE,
    });
    const a = c.departments.find((d) => d.parentRef === DEP_A);
    expect(a?.parentValue).toBe(600n);
    expect(a?.allocated).toBe(400n);
    expect(a?.unallocated).toBe(200n);
    expect(a?.unsetChildRefs).toEqual(['emp-2']); // maqsadi yo'q xodim ko'rinadi

    const b = c.departments.find((d) => d.parentRef === DEP_B);
    expect(b?.status).toBe(CASCADE_STATUS.exact);
  });

  it('🔴 bo`limga biriktirilmagan xodim JIM YO`QOLMAYDI', () => {
    const c = buildCascade(rows, org, {
      metricKey: 'cash_revenue',
      period: TARGET_PERIOD.daily,
      date: DATE,
    });
    expect(c.unassignedEmployeeRefs).toEqual(['emp-9']);
  });

  it('🔴 kaskad o`qiga tushmagan qator (lavozim) jimgina tashlanmaydi', () => {
    const withPosition = [
      ...rows,
      row({ id: 'pos', scope: TARGET_SCOPE.position, scopeRef: 'p-1' }),
    ];
    const c = buildCascade(withPosition, org, {
      metricKey: 'cash_revenue',
      period: TARGET_PERIOD.daily,
      date: DATE,
    });
    expect(c.outOfCascadeRowIds).toEqual(['pos']);
  });

  it('boshqa ko`rsatkich va boshqa davr qatorlari aralashmaydi', () => {
    const mixed = [
      ...rows,
      row({
        id: 'other',
        scope: TARGET_SCOPE.department,
        scopeRef: DEP_A,
        metricKey: 'gross_profit',
        targetValue: 99n,
      }),
      row({
        id: 'weekly',
        scope: TARGET_SCOPE.department,
        scopeRef: DEP_A,
        period: TARGET_PERIOD.weekly,
        targetValue: 88n,
      }),
    ];
    const c = buildCascade(mixed, org, {
      metricKey: 'cash_revenue',
      period: TARGET_PERIOD.daily,
      date: DATE,
    });
    expect(c.departments.find((d) => d.parentRef === DEP_A)?.parentValue).toBe(600n);
    expect(c.outOfCascadeRowIds).toEqual([]); // boshqa metric/davr — «tushmagan» emas, begona
  });

  it('amal qilmayotgan (arxiv/oyna tashqarisi) qator maqsad bermaydi', () => {
    const c = buildCascade(
      [
        row({ id: 'acc', targetValue: 1_000n }),
        row({ id: 'da', scope: TARGET_SCOPE.department, scopeRef: DEP_A, archived: true }),
        row({
          id: 'db',
          scope: TARGET_SCOPE.department,
          scopeRef: DEP_B,
          effectiveFrom: '2026-09-01',
        }),
      ],
      org,
      { metricKey: 'cash_revenue', period: TARGET_PERIOD.daily, date: DATE },
    );
    expect(c.top.unsetChildRefs).toEqual([DEP_A, DEP_B]);
    expect(c.top.allocated).toBe(0n);
    expect(c.top.unallocated).toBe(1_000n);
  });

  it('bitta qamrov uchun ikki qator bo`lsa g`olib DETERMINIST (kirish tartibi ta`sir qilmaydi)', () => {
    const a = row({
      id: 'aaa',
      scope: TARGET_SCOPE.department,
      scopeRef: DEP_A,
      targetValue: 111n,
    });
    const b = row({
      id: 'bbb',
      scope: TARGET_SCOPE.department,
      scopeRef: DEP_A,
      targetValue: 222n,
    });
    const opts = { metricKey: 'cash_revenue', period: TARGET_PERIOD.daily, date: DATE } as const;
    const first = buildCascade([a, b], org, opts).departments.find((d) => d.parentRef === DEP_A);
    const second = buildCascade([b, a], org, opts).departments.find((d) => d.parentRef === DEP_A);
    expect(first?.parentValue).toBe(111n);
    expect(second?.parentValue).toBe(111n);
  });
});

describe('cascadeChangePoints — kaskad o`zgarishi tarixi (yangi jadvalsiz)', () => {
  it('qator boshlanish va TUGASH sanalari o`zgarish nuqtasi bo`ladi', () => {
    const rows = [
      row({
        id: 'a',
        scope: TARGET_SCOPE.department,
        scopeRef: DEP_A,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-06-30',
      }),
      row({
        id: 'b',
        scope: TARGET_SCOPE.department,
        scopeRef: DEP_A,
        effectiveFrom: '2026-07-01',
      }),
    ];
    const points = cascadeChangePoints(rows, {
      metricKey: 'cash_revenue',
      period: TARGET_PERIOD.daily,
    });
    expect(points).toEqual([
      { date: '2026-01-01', startedRowIds: ['a'], endedRowIds: [] },
      { date: '2026-06-30', startedRowIds: [], endedRowIds: ['a'] },
      { date: '2026-07-01', startedRowIds: ['b'], endedRowIds: [] },
    ]);
  });

  it('kaskadga kirmaydigan qamrov tarixga ham kirmaydi', () => {
    const points = cascadeChangePoints(
      [row({ id: 'p', scope: TARGET_SCOPE.position, scopeRef: 'p-1' })],
      { metricKey: 'cash_revenue', period: TARGET_PERIOD.daily },
    );
    expect(points).toEqual([]);
  });
});

describe('splitEvenly — haftalikni kunlarga bo`lish (JIM taxmin yo`q)', () => {
  it('teng bo`linsa qoldiq 0', () => {
    expect(splitEvenly(700n, 7)).toEqual({ each: 100n, remainder: 0n });
  });

  it('🔴 teng bo`linmasa qoldiq YASHIRILMAYDI (yaxlitlab yubormaydi)', () => {
    expect(splitEvenly(1_000n, 3)).toEqual({ each: 333n, remainder: 1n });
  });

  it('kun soni 0 bo`lsa bo`lish YO`Q (0 ga bo`lish emas, `null`)', () => {
    expect(splitEvenly(1_000n, 0)).toBeNull();
  });
});

/**
 * 🔴 Rejaning 3-testi — «yangi model yaratilmagan». MK22 MAVJUD `KpiTargetRow`
 * shakli ustida ishlaydi; uchinchi plan modeli (`KpiTarget`/`SalesPlan` dan
 * tashqari) ochilmaydi. Bu YO'Q xususiyat — birlik-test bilan isbotlanmaydi,
 * shuning uchun manba matni skanerlanadi (`decision-journal-read-only` uslubi).
 */
describe('🔴 MK22 — uchinchi plan modeli OCHILMAYDI', () => {
  it('sxemada kaskad/taqsimot modeli yo`q', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1] as string);
    expect(models.filter((m) => /cascade|allocation/i.test(m))).toEqual([]);
  });

  it('kaskad qatlami SOF — DB/Prisma/soatga tegmaydi', () => {
    // Izohlar OLIB TASHLANADI: hujjat matnidagi «`Date.now()` yo'q» jumlasi
    // qo'riqchini yolg'on ishga tushirmasin. Haqiqiy chaqiruv kodda qoladi,
    // shuning uchun bu qo'riqchini ZAIFLASHTIRMAYDI.
    const src = codeOnly(readFileSync(join(KPI_DIR, 'kpi-target-cascade.ts'), 'utf8'));
    expect(src).not.toMatch(/prisma|PrismaService|@nestjs/i);
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/new Date\(/);
  });

  it('kaskad g`olib-qator tanlashda MK13 mantiqini QAYTA yozmaydi (DRY)', () => {
    // Nusxa-ko'chirish bir shoxni yo'qotadi (xotira: copy-paste-loses-a-branch).
    const src = codeOnly(readFileSync(join(KPI_DIR, 'kpi-target-cascade.ts'), 'utf8'));
    expect(src).toMatch(/from '\.\/kpi-target\.js'/);
    expect(src).not.toMatch(/SCOPE_RANK|maskWidth/);
  });

  it('kpi papkasida boshqa kaskad modeli fayli paydo bo`lmagan', () => {
    const files = readdirSync(KPI_DIR).filter((f) => statSync(join(KPI_DIR, f)).isFile());
    expect(files.filter((f) => /cascade/.test(f)).sort()).toEqual([
      'kpi-target-cascade.test.ts',
      'kpi-target-cascade.ts',
    ]);
  });
});
