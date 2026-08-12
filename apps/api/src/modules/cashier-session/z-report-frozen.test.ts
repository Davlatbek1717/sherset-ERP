import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * Z-hisobot MUZLATILGAN raqamni bosadi (yopilgan smenada).
 *
 * Muammo (Faza 6): `close()` `expectedCashMinor`/`discrepancyMinor` ni
 * Serializable tranzaksiyada hisoblab MUZLATADI va farq aktini yozadi —
 * kassir AYNAN o'shanga imzo qo'yadi. `zReport()` esa ularni QAYTA
 * HISOBLARDI. Natijada bitta smena uchun uch xil raqam yurardi: Z-chek
 * qayta hisoblanganini bosardi, web sahifa muzlatilganini ko'rsatardi,
 * menejer ekrani aktni. Yopilgandan keyin manba o'zgarsa (qarz to'lovi
 * stornosi, chek holati o'zgarishi, qo'lda tuzatish) farqsiz yopilgan
 * smena keyin «ortiqcha» ko'rsatardi.
 *
 * Qaror: yopilgan smenada MUZLATILGAN, ochiq smenada JONLI (yopish
 * formasi preview'i). Javobda `basis: 'frozen' | 'live'` bilan OCHIQ
 * belgilanadi.
 *
 * Bu yerdagi testlar ATAYLAB ikki qatlamli:
 *  1. **Xulq** — haqiqiy `zReport()` haqiqiy `buildZReport()` sof moduli
 *     bilan chaqiriladi (Prisma dublyori `where` ni haqiqiy qatorlar
 *     ustida baholaydi). Manba-matn qulfi bug'ni KO'RMAYDI: u faqat
 *     satr bor-yo'qligini biladi, qaysi raqam javobga chiqqanini emas.
 *  2. **Manba-matn qulfi** — jonli shox (`open` preview) tasodifan
 *     olib tashlanmasin.
 */

const SRC = readFileSync(join(import.meta.dirname, 'cashier-session.service.ts'), 'utf8');

const ACC = 'acc-1';
const SESSION = '22222222-2222-4222-8222-222222222222';

// ---------------------------------------------------------------------------
// Prisma dublyori — `where` haqiqiy qatorlar ustida baholanadi.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function matches(where: Row | undefined, row: Row): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (typeof cond === 'object' && cond !== null) {
      const c = cond as Record<string, unknown>;
      if ('in' in c) {
        if (!(c.in as unknown[]).includes(value)) return false;
        continue;
      }
      if ('not' in c) {
        if (c.not === null) {
          if (value === null || value === undefined) return false;
          continue;
        }
        if (value === c.not) return false;
        continue;
      }
      if (!matches(c, (value ?? {}) as Row)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function sumOf(rows: Row[], fields: Row): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const f of Object.keys(fields)) {
    out[f] = rows.reduce((a, r) => a + ((r[f] as bigint | undefined) ?? 0n), 0n);
  }
  return out;
}

function tableOf(rows: Row[]) {
  return {
    findMany: vi.fn(async (args?: { where?: Row }) =>
      rows.filter((r) => matches(args?.where, r)).map((r) => ({ ...r })),
    ),
    aggregate: vi.fn(async (args: { where?: Row; _sum?: Row }) => {
      const hit = rows.filter((r) => matches(args.where, r));
      return { _sum: args._sum ? sumOf(hit, args._sum) : undefined };
    }),
    groupBy: vi.fn(async (args: { by: string[]; where?: Row; _sum?: Row }) => {
      const hit = rows.filter((r) => matches(args.where, r));
      const keyOf = (r: Row) => args.by.map((b) => String(r[b])).join(' ');
      const keys = [...new Set(hit.map(keyOf))];
      return keys.map((k) => {
        const group = hit.filter((r) => keyOf(r) === k);
        const out: Row = { _sum: sumOf(group, args._sum ?? {}) };
        for (const b of args.by) out[b] = group[0]?.[b];
        return out;
      });
    }),
  };
}

interface Fixture {
  state?: 'open' | 'closed';
  openingCashMinor?: bigint;
  closingCashMinor?: bigint | null;
  /** `close()` MUZLATGAN qiymat; `null` = eski qator (o'lchanmagan). */
  expectedCashMinor?: bigint | null;
  openingCashUsdMinor?: bigint;
  closingCashUsdMinor?: bigint | null;
  expectedCashUsdMinor?: bigint | null;
  sales?: Row[];
  debtPayments?: Row[];
}

function makeClient(f: Fixture = {}) {
  const session: Row = {
    id: SESSION,
    accountId: ACC,
    state: f.state ?? 'closed',
    openedAt: new Date('2026-08-11T08:00:00Z'),
    closedAt: f.state === 'open' ? null : new Date('2026-08-11T20:00:00Z'),
    openingCashMinor: f.openingCashMinor ?? 0n,
    closingCashMinor: f.closingCashMinor ?? null,
    expectedCashMinor: f.expectedCashMinor ?? null,
    openingCashUsdMinor: f.openingCashUsdMinor ?? 0n,
    closingCashUsdMinor: f.closingCashUsdMinor ?? null,
    expectedCashUsdMinor: f.expectedCashUsdMinor ?? null,
    cashier: { id: 'emp-1', name: 'Kassir' },
    cashDesk: { id: 'cd-1', name: 'Kassa', currency: 'UZS' },
    store: { name: 'Do`kon' },
    organization: { name: 'Tashkilot', legalTitle: null },
  };

  const client = {
    cashierSession: { findFirst: vi.fn(async () => ({ ...session })) },
    retailSale: tableOf(f.sales ?? []),
    retailSalePayment: tableOf([]),
    debtPayment: tableOf(f.debtPayments ?? []),
    retailDrawerCashIn: tableOf([]),
    retailDrawerCashOut: tableOf([]),
    cashierSessionVariance: { findMany: vi.fn(async () => []) },
  };
  return { client, session };
}

const svcOf = (client: unknown) => new CashierSessionService({ client } as never, {} as never);

function sale(over: Row = {}): Row {
  return {
    id: 'sale-1',
    accountId: ACC,
    sessionId: SESSION,
    state: 'posted',
    refundedFromId: null,
    sumMinor: 0n,
    cashAmountMinor: 0n,
    changeMinor: 0n,
    positions: [],
    ...over,
  };
}

interface ZShape {
  basis: string;
  expectedCashMinor: string;
  varianceMinor: string | null;
  expectedUsdCashMinor: string;
  varianceUsdMinor: string | null;
}

const zOf = (client: unknown) => svcOf(client).zReport(ACC, SESSION) as Promise<ZShape>;

// ---------------------------------------------------------------------------
// 1. Yopilgan smena — MUZLATILGAN raqam
// ---------------------------------------------------------------------------

/**
 * Ssenariy jonli bug'dan olingan: smena 150 000 kutilgan naqd bilan
 * FARQSIZ yopilgan (kassir imzolagan akt: 0). Keyin manba o'zgargan —
 * 30 000 lik naqd qarz to'lovi storno qilingan. Jonli hisob endi
 * 120 000 beradi, ya'ni o'sha smena keyin 30 000 «ORTIQCHA» ko'rsatadi.
 */
describe('zReport · yopilgan smena — muzlatilgan raqam', () => {
  const closedFixture = () =>
    makeClient({
      state: 'closed',
      openingCashMinor: 100_000n,
      expectedCashMinor: 150_000n, // close() muzlatgani
      closingCashMinor: 150_000n, // kassir sanagani
      sales: [sale({ cashAmountMinor: 20_000n, sumMinor: 20_000n })], // jonli: 120 000
    });

  it('MUZLATILGAN `expectedCashMinor` qaytariladi (qayta hisob EMAS)', async () => {
    const z = await zOf(closedFixture().client);
    expect(z.expectedCashMinor).toBe('150000');
  });

  it('farq muzlatilgandan hisoblanadi — farqsiz smena «ortiqcha» chiqmaydi', async () => {
    // Bug: jonli 120 000 bilan bu qiymat '30000' bo'lardi, akt esa 0 deb
    // turardi — bitta javob ichida ikki avlod raqam.
    const z = await zOf(closedFixture().client);
    expect(z.varianceMinor).toBe('0');
  });

  it('javob asosini OCHIQ belgilaydi: `basis: "frozen"`', async () => {
    const z = await zOf(closedFixture().client);
    expect(z.basis).toBe('frozen');
  });
});

// ---------------------------------------------------------------------------
// 2. Eski yopiq qator (`expectedCashMinor = null`) — jonli, HALOL belgilangan
// ---------------------------------------------------------------------------

describe('zReport · yopiq, lekin muzlatilmagan (eski qator)', () => {
  // Lokal bazada 4 yopiq smenadan 2 tasida ustun `null`. `null` ni 0 deb
  // o'qish soxta KAMOMAD berardi (`NULL` ≠ `0`).
  const legacyClosed = () =>
    makeClient({
      state: 'closed',
      openingCashMinor: 100_000n,
      expectedCashMinor: null,
      closingCashMinor: 120_000n,
      sales: [sale({ cashAmountMinor: 20_000n, sumMinor: 20_000n })],
    });

  it('jonli hisob ishlatiladi (`null` 0 deb o`qilmaydi)', async () => {
    const z = await zOf(legacyClosed().client);
    expect(z.expectedCashMinor).toBe('120000');
    expect(z.varianceMinor).toBe('0');
  });

  it('`basis: "live"` — hisobot muzlatilgan hujjat EMASLIGINI halol aytadi', async () => {
    const z = await zOf(legacyClosed().client);
    expect(z.basis).toBe('live');
  });
});

// ---------------------------------------------------------------------------
// 3. Ochiq smena — jonli preview BUZILMAYDI
// ---------------------------------------------------------------------------

describe('zReport · ochiq smena — jonli preview', () => {
  it('jonli hisob qaytariladi va `basis: "live"`', async () => {
    // `expectedCashMinor` ochiq smenada ham to'lgan bo'lishi mumkin (oldingi
    // yopish urinishidan qolgan eskirgan qiymat) — u O'QILMASLIGI kerak.
    const { client } = makeClient({
      state: 'open',
      openingCashMinor: 100_000n,
      expectedCashMinor: 999_000n,
      sales: [sale({ cashAmountMinor: 20_000n, sumMinor: 20_000n })],
    });

    const z = await zOf(client);
    expect(z.expectedCashMinor).toBe('120000');
    expect(z.basis).toBe('live');
  });

  it('sanoqsiz ochiq smenada farq `null` (0 EMAS)', async () => {
    const { client } = makeClient({ state: 'open', openingCashMinor: 100_000n });
    const z = await zOf(client);
    expect(z.varianceMinor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Dollar tomoni — xuddi shu shartnoma (MK31 · §8.4)
// ---------------------------------------------------------------------------

describe('zReport · dollar yashiq', () => {
  it('yopilgan smenada MUZLATILGAN `expectedCashUsdMinor` olinadi', async () => {
    const { client } = makeClient({
      state: 'closed',
      expectedCashMinor: 150_000n,
      closingCashMinor: 150_000n,
      expectedCashUsdMinor: 5_000n, // sent
      closingCashUsdMinor: 5_000n,
    });

    const z = await zOf(client);
    expect(z.expectedUsdCashMinor).toBe('5000');
    expect(z.varianceUsdMinor).toBe('0');
  });

  it('dollar ustuni `null` bo`lgan yopiq smenada jonli hisob ishlatiladi', async () => {
    // So'm tomoni muzlatilgan (`basis: frozen`), dollar ustuni esa
    // TEGILMAGAN (`usdTouched` false bo'lgan smena) — uni 0 deb muzlatilgan
    // ko'rsatish «dollar sanaldi» degan yolg'on bo'lardi.
    const { client } = makeClient({
      state: 'closed',
      expectedCashMinor: 150_000n,
      closingCashMinor: 150_000n,
      expectedCashUsdMinor: null,
      closingCashUsdMinor: null,
    });

    const z = await zOf(client);
    expect(z.basis).toBe('frozen');
    expect(z.expectedUsdCashMinor).toBe('0');
    expect(z.varianceUsdMinor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Manba-matn qulfi — jonli shox saqlanadi
// ---------------------------------------------------------------------------

describe('zReport · manba-matn qulfi', () => {
  function methodBody(name: string): string {
    const start = SRC.indexOf(`async ${name}(`);
    expect(start, `${name} topilmadi`).toBeGreaterThan(-1);
    const end = SRC.indexOf('\n  /**', start);
    return SRC.slice(start, end === -1 ? SRC.length : end);
  }

  const body = methodBody('zReport');

  it('muzlatilgan ustun O`QILADI', () => {
    expect(body).toMatch(/session\.expectedCashMinor/);
  });

  it('javob asosi maydonda OCHIQ turadi (`basis`)', () => {
    expect(body).toMatch(/basis:/);
  });

  it('`null` qo`riqchisi shartda qoladi (eski qator jim 0 bo`lmasin)', () => {
    expect(body).toMatch(/state === 'closed' && session\.expectedCashMinor !== null/);
  });

  it('jonli shox QOLADI — ochiq smena preview`i buzilmasin', () => {
    expect(body).toMatch(/expectedCashMinor\(cashInputs\)/);
    expect(body).toMatch(/expectedUsdCashMinor\(usdInputs\)/);
  });
});
