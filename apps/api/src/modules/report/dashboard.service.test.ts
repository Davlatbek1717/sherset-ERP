import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';

/**
 * Faza 26 — dashboard PERF-05 / PERF-06 / PERF-11 qoplamasi.
 *
 * Uch da'vo shu yerda qulflanadi:
 *  - PERF-11: «Просроченные счета» paneli item'lari agregat bilan BIR XIL
 *    predikatdan keladi (eng eski 40 hujjat to'langan bo'lsa ham panel bo'sh
 *    qolmaydi) — eski over-fetch + JS-filtr evristikasi olib tashlangan.
 *  - PERF-06: bir dashboard so'rovida `loadRateContext` BIR marta yuklanadi
 *    (ilgari uch marta) va pul bloklari qisqa-TTL kesh ostida — TTL ichida
 *    ikkinchi so'rov butun-tarix UNION agregatini QAYTA yugurtirmaydi.
 *    Kesh kaliti akkauntga bog'liq (tenant sizib chiqmaydi).
 *
 * PERF-05 (updatedAt indeksi) DB-tomon o'zgarishi — u migratsiya + EXPLAIN
 * bilan o'lchandi (hisobotda), unit-testga tushmaydi.
 */

const E8 = 100_000_000n;
const NOW = new Date('2026-05-20T10:00:00Z');

interface RawCase {
  match: (sql: string) => boolean;
  rows: unknown[];
}

interface Options {
  /** invoices_out raw item so'rovi qaytaradigan qatorlar (yangi yo'l). */
  overdueInvoiceItems?: Array<{
    id: string;
    name: string;
    owed_minor: bigint;
    payment_planned_moment: Date;
    agent_id: string | null;
  }>;
  /** invoices_out agregati (currency bo'yicha). */
  overdueInvoiceAgg?: Array<{ currency: string; cnt: bigint; total: bigint }>;
  /** ESKI yo'l: `invoiceOut.findMany` over-fetch nomzodlari. */
  legacyCandidates?: Array<Record<string, unknown>>;
  ledgerRows?: Array<{ organization_id: string; currency: string; balance: bigint }>;
}

function makeDeps(opts: Options = {}) {
  const salesTotals = {
    salesCount: 0,
    sumMinor: '0',
    netSumMinor: '0',
    profitMinor: '0',
  };
  const salesService = {
    salesReport: vi.fn(async () => ({ totals: salesTotals, groups: [] })),
  };
  const cashFlowService = {
    cashFlowReport: vi.fn(async () => ({
      totals: { inflowSumMinor: '0', outflowSumMinor: '0', netSumMinor: '0' },
    })),
  };
  const cpBalanceService = {
    counterpartyBalanceReport: vi.fn(async () => ({
      summaries: {
        totalDebtMinor: '0',
        totalCreditMinor: '0',
        debtorCount: 0,
        creditorCount: 0,
      },
    })),
  };

  const cases: RawCase[] = [
    // recentDocs — 12 legli UNION
    { match: (s) => s.includes('FROM customer_orders'), rows: [] },
    // overdue invoices — agregat (currency bo'yicha)
    {
      match: (s) => s.includes('invoices_out') && s.includes('GROUP BY currency'),
      rows: opts.overdueInvoiceAgg ?? [],
    },
    // overdue invoices — item'lar (PERF-11 dan keyingi yangi raw so'rov)
    {
      match: (s) => s.includes('invoices_out'),
      rows: opts.overdueInvoiceItems ?? [],
    },
    // money by org — butun tarix
    { match: (s) => s.includes('WITH ledger'), rows: opts.ledgerRows ?? [] },
    // money chart — 6 oy
    { match: (s) => s.includes('WITH ops'), rows: [] },
    // stock past qoldiq
    { match: (s) => s.includes('FROM stocks'), rows: [{ cnt: 0n }] },
  ];

  const $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.raw.join(' ');
    const hit = cases.find((c) => c.match(sql));
    if (!hit) throw new Error(`kutilmagan raw so'rov: ${sql.slice(0, 120)}`);
    return hit.rows;
  });

  const client = {
    currency: {
      findMany: vi.fn(async () => [
        {
          code: 'UZS',
          isoCode: 'UZS',
          default: true,
          rateValue: E8,
          multiplicity: 1,
          indirect: false,
        },
      ]),
    },
    counterparty: {
      findMany: vi.fn(async () => [
        { id: 'cp-1', name: 'Alfa' },
        { id: 'cp-2', name: 'Beta' },
      ]),
    },
    organization: {
      findMany: vi.fn(async () => [{ id: 'org-1', name: 'Org' }]),
    },
    customerOrder: {
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _count: { _all: 0 }, _sum: { sumMinor: null } })),
    },
    invoiceOut: {
      findMany: vi.fn(async () => opts.legacyCandidates ?? []),
    },
    stock: { count: vi.fn(async () => 0) },
    task: { count: vi.fn(async () => 0) },
    $queryRaw,
  };

  const svc = new DashboardService(
    { client } as never,
    salesService as never,
    cashFlowService as never,
    cpBalanceService as never,
  );
  return { svc, client, $queryRaw };
}

/** Nechta raw so'rov berilgan predikatga mos keldi. */
function rawCalls($queryRaw: ReturnType<typeof vi.fn>, needle: string): number {
  return $queryRaw.mock.calls.filter((c) =>
    (c[0] as TemplateStringsArray).raw.join(' ').includes(needle),
  ).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardService — PERF-11: overdue invoice items match the aggregate predicate', () => {
  it('surfaces genuinely unpaid invoices even when the 40 oldest are fully paid', async () => {
    // Eng eski 40 hujjat TO'LIQ to'langan (eski over-fetch shularni olardi
    // va JS-filtr hammasini tashlab yuborardi ⇒ count>0, items=[]).
    const legacyCandidates = Array.from({ length: 40 }, (_, i) => ({
      id: `paid-${i}`,
      name: `СЧ-${i}`,
      sumMinor: 1_000n,
      payedSumMinor: 1_000n,
      paymentPlannedMoment: new Date('2026-01-01T00:00:00Z'),
      agent: { name: 'Alfa' },
    }));

    const { svc } = makeDeps({
      legacyCandidates,
      overdueInvoiceAgg: [{ currency: 'UZS', cnt: 2n, total: 700n }],
      overdueInvoiceItems: [
        {
          id: 'inv-a',
          name: 'СЧ-100',
          owed_minor: 500n,
          payment_planned_moment: new Date('2026-05-10T00:00:00Z'),
          agent_id: 'cp-1',
        },
        {
          id: 'inv-b',
          name: 'СЧ-101',
          owed_minor: 200n,
          payment_planned_moment: new Date('2026-05-18T00:00:00Z'),
          agent_id: 'cp-2',
        },
      ],
    });

    const r = await svc.dashboard('acc-1', 'user-1', {});

    expect(r.overdueInvoices.count).toBe(2);
    expect(r.overdueInvoices.items.map((i) => i.id)).toEqual(['inv-a', 'inv-b']);
    // moysklad qarz summasini ko'rsatadi (gross emas)
    expect(r.overdueInvoices.items[0]?.sumMinor).toBe('500');
    expect(r.overdueInvoices.items[0]?.counterpartyName).toBe('Alfa');
    expect(r.overdueInvoices.items[0]?.daysOverdue).toBe(10);
  });

  it('no longer over-fetches through the Prisma findMany heuristic', async () => {
    const { svc, client } = makeDeps({
      overdueInvoiceAgg: [{ currency: 'UZS', cnt: 0n, total: 0n }],
      overdueInvoiceItems: [],
    });
    await svc.dashboard('acc-1', 'user-1', {});
    expect(client.invoiceOut.findMany).not.toHaveBeenCalled();
  });
});

describe('DashboardService — PERF-05: recent-docs UNION shape', () => {
  it('gives every leg its own ORDER BY … LIMIT', async () => {
    // Measured (EXPLAIN ANALYZE, 24k rows in one leg): with the 12
    // (account_id, updated_at DESC) indexes but WITHOUT the per-leg LIMIT the
    // planner still Seq Scans every table and top-N sorts the lot — 66 ms vs
    // 0.55 ms. The indexes only pay off together with this query shape, and a
    // leg that loses its LIMIT during an edit would silently take the cost
    // back, so the shape is locked here rather than left to review.
    const { svc, $queryRaw } = makeDeps();
    await svc.dashboard('acc-1', 'user-1', {});

    const call = $queryRaw.mock.calls.find((c) =>
      (c[0] as TemplateStringsArray).raw.join(' ').includes('FROM customer_orders'),
    );
    const sql = (call?.[0] as TemplateStringsArray).raw.join('?');

    expect(sql.match(/UNION ALL/g)?.length).toBe(11); // 12 legs
    expect(sql.match(/ORDER BY updated_at DESC LIMIT/g)?.length).toBe(12);
  });
});

describe('DashboardService — Faza Q16: recentDocs soft-delete filtri', () => {
  it("o'chirilgan hujjat «Недавние документы» ga TUSHMAYDI (12 legda deleted_at IS NULL)", async () => {
    // Faza 26 DEFER-2: 12 legning birortasida ham `deleted_at` filtri yo'q edi,
    // ya'ni soft-delete qilingan hujjat bosh sahifada ko'rinib turardi.
    const { svc, $queryRaw } = makeDeps();
    await svc.dashboard('acc-1', 'user-1', {});

    const call = $queryRaw.mock.calls.find((c) =>
      (c[0] as TemplateStringsArray).raw.join(' ').includes('FROM customer_orders'),
    );
    const sql = (call?.[0] as TemplateStringsArray).raw.join('?');

    expect(sql.match(/deleted_at IS NULL/g)?.length).toBe(12);
  });

  it('Faza 26 shakl-qulfi SAQLANADI — har leg hamon o‘z ORDER BY … LIMIT ига эга', async () => {
    // Filtr qo'shilishi per-leg LIMIT ni siqib chiqarmasligi kerak: EXPLAIN
    // o'lchovi (0.55 ms vs 66 ms) aynan shu shaklga bog'liq.
    const { svc, $queryRaw } = makeDeps();
    await svc.dashboard('acc-1', 'user-1', {});

    const call = $queryRaw.mock.calls.find((c) =>
      (c[0] as TemplateStringsArray).raw.join(' ').includes('FROM customer_orders'),
    );
    const sql = (call?.[0] as TemplateStringsArray).raw.join('?');

    expect(sql.match(/UNION ALL/g)?.length).toBe(11);
    expect(sql.match(/ORDER BY updated_at DESC LIMIT/g)?.length).toBe(12);
  });
});

describe('DashboardService — Faza Q16: unconvertedByCurrency vidjetlarda', () => {
  it('overdue-schyot bloki kursi topilmagan valyutani OSHKORA qaytaradi', async () => {
    // Kontekstda faqat UZS bor (makeDeps mock'i) ⇒ EUR konvertatsiya
    // qilinmaydi, jamiga qo'shilmaydi va endi javobda ko'rinadi.
    const { svc } = makeDeps({
      overdueInvoiceAgg: [
        { currency: 'UZS', cnt: 1n, total: 300n },
        { currency: 'EUR', cnt: 1n, total: 500n },
      ],
      overdueInvoiceItems: [],
    });

    const r = await svc.dashboard('acc-1', 'user-1', {});

    expect(r.overdueInvoices.totalSumMinor).toBe('300'); // EUR jamida YO'Q
    expect(r.overdueInvoices.unconvertedByCurrency).toEqual([
      { currency: 'EUR', amountMinor: '500' },
    ]);
  });

  it('pul bloki (org-balans + grafik) kursi topilmagan valyutani qaytaradi', async () => {
    const { svc } = makeDeps({
      ledgerRows: [
        { organization_id: 'org-1', currency: 'UZS', balance: 1_000n },
        { organization_id: 'org-1', currency: 'EUR', balance: 700n },
      ],
    });

    const r = await svc.dashboard('acc-1', 'user-1', {});

    expect(r.money.totalSumMinor).toBe('1000');
    expect(r.money.unconvertedByCurrency).toEqual([{ currency: 'EUR', amountMinor: '700' }]);
  });

  it('konvertatsiya toza bo‘lganda ro‘yxat BO‘SH (banner chiqmaydi)', async () => {
    const { svc } = makeDeps({
      overdueInvoiceAgg: [{ currency: 'UZS', cnt: 1n, total: 300n }],
      ledgerRows: [{ organization_id: 'org-1', currency: 'UZS', balance: 1_000n }],
    });

    const r = await svc.dashboard('acc-1', 'user-1', {});

    expect(r.overdueInvoices.unconvertedByCurrency).toEqual([]);
    expect(r.money.unconvertedByCurrency).toEqual([]);
    // Buyurtma bloki umuman konvertatsiya qilmaydi (face-value jam) —
    // shu sabab ro'yxati DOIM bo'sh; bu ochiq qarz, hisobotda qayd etilgan.
    expect(r.overdueOrders.unconvertedByCurrency).toEqual([]);
  });
});

describe('DashboardService — PERF-06: rate context + money-block cache', () => {
  it('loads the rate context once per request (was: three times)', async () => {
    const { svc, client } = makeDeps();
    await svc.dashboard('acc-1', 'user-1', {});
    expect(client.currency.findMany).toHaveBeenCalledTimes(1);
  });

  it('serves the whole-history money aggregates from cache within the TTL', async () => {
    const { svc, $queryRaw } = makeDeps({
      ledgerRows: [{ organization_id: 'org-1', currency: 'UZS', balance: 5_000n }],
    });

    const first = await svc.dashboard('acc-1', 'user-1', {});
    const second = await svc.dashboard('acc-1', 'user-1', {});

    expect(rawCalls($queryRaw, 'WITH ledger')).toBe(1);
    expect(rawCalls($queryRaw, 'WITH ops')).toBe(1);
    expect(second.money.totalSumMinor).toBe(first.money.totalSumMinor);
    expect(second.money.totalSumMinor).toBe('5000');
  });

  it('keys the cache by account — one tenant never serves another', async () => {
    const { svc, $queryRaw } = makeDeps({
      ledgerRows: [{ organization_id: 'org-1', currency: 'UZS', balance: 5_000n }],
    });

    await svc.dashboard('acc-1', 'user-1', {});
    await svc.dashboard('acc-2', 'user-1', {});

    expect(rawCalls($queryRaw, 'WITH ledger')).toBe(2);
  });

  it('re-queries after the TTL expires', async () => {
    const { svc, $queryRaw } = makeDeps({
      ledgerRows: [{ organization_id: 'org-1', currency: 'UZS', balance: 5_000n }],
    });

    await svc.dashboard('acc-1', 'user-1', {});
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    await svc.dashboard('acc-1', 'user-1', {});

    expect(rawCalls($queryRaw, 'WITH ledger')).toBe(2);
  });
});
