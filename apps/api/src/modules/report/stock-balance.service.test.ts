import { Prisma } from '@moysklad/db';
import { describe, expect, it, vi } from 'vitest';
import { StockInTransitService } from '../stock/stock-in-transit.service.js';
import { PRODUCT_SEARCH_CAP, StockBalanceService } from './stock-balance.service.js';

/**
 * Unit coverage for the report's *displayed* «Доступно» = `Остаток − Резерв +
 * Ожидание` (backlog B, design doc `_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md`).
 *
 * The report derives expected-incoming («Ожидание» / `inTransitQty`) at
 * QUERY-TIME via the shared `StockInTransitService` (unit-tested in
 * apps/api/src/modules/stock/stock-in-transit.service.test.ts) rather than
 * reading the dropped always-0 `Stock.inTransitQty` column. Here we wire a real
 * StockInTransitService over the same mocked Prisma client so the end-to-end
 * report shape (Ожидание populated, available folds it in) is exercised.
 *
 * These stub the Prisma boundary (the established report-service test pattern —
 * see slow-movers/counterparty-balance) with canned Stock + PurchaseOrderPosition
 * rows. The actual relation-filtered SQL is exercised live by
 * scripts/verify-in-transit-stock-balance-smoke.mjs (a stub can't prove the join).
 *
 * § references are to the design doc.
 */

const D = (v: string | number) => new Prisma.Decimal(v);

interface CannedPosition {
  assortmentKind?: string;
  assortmentId: string;
  quantity: Prisma.Decimal;
  receivedQty: Prisma.Decimal;
  purchaseOrder: { storeId: string };
}

interface CannedStock {
  storeId: string;
  assortmentKind?: string;
  assortmentId: string;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  store?: { id: string; name: string };
}

interface CannedGroup {
  assortmentKind: string;
  assortmentId: string;
  _sum: { qty: Prisma.Decimal; reservedQty: Prisma.Decimal };
}

function makeService(opts: {
  stocks?: CannedStock[];
  grouped?: CannedGroup[];
  positions?: CannedPosition[];
  products?: Array<{ id: string; name: string; code: string | null; uom: string | null }>;
  count?: number;
}) {
  const findManyPositions = vi.fn(async () =>
    (opts.positions ?? []).map((p) => ({ assortmentKind: 'product', ...p })),
  );
  const client = {
    stock: {
      findMany: vi.fn(async () =>
        (opts.stocks ?? []).map((s) => ({ assortmentKind: 'product', ...s })),
      ),
      groupBy: vi.fn(async () => opts.grouped ?? []),
      count: vi.fn(async () => opts.count ?? opts.stocks?.length ?? 0),
    },
    product: { findMany: vi.fn(async () => opts.products ?? []) },
    purchaseOrderPosition: { findMany: findManyPositions },
    // FAZA 27a: grouped rejim endi guruh-count agregatini so‘raydi.
    $queryRaw: vi.fn(async () => [{ count: BigInt(opts.grouped?.length ?? 0) }]),
  };
  // Wire a real StockInTransitService over the same mocked client — the report
  // delegates the in-transit query to it (the shared single-source-of-truth).
  const inTransit = new StockInTransitService({ client } as never);
  const svc = new StockBalanceService({ client } as never, inTransit);
  return { svc, findManyPositions };
}

describe('StockBalanceService — display «Доступно» = Остаток − Резерв + Ожидание (§6)', () => {
  it('flat: populates «Ожидание» and adds it to available + summaries', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentId: 'P1',
          qty: D(10),
          reservedQty: D(2),
          store: { id: 'S1', name: 'Main' },
        },
      ],
      positions: [
        // 20 ordered, 5 received → 15 in transit
        {
          assortmentId: 'P1',
          quantity: D(20),
          receivedQty: D(5),
          purchaseOrder: { storeId: 'S1' },
        },
      ],
      products: [{ id: 'P1', name: 'Prod1', code: 'C1', uom: 'pcs' }],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', {});
    expect(r.items[0]?.inTransitQty).toBe('15');
    expect(r.items[0]?.available).toBe('23'); // 10 − 2 + 15
    expect(r.summaries.totalInTransit).toBe('15');
    expect(r.summaries.totalAvailable).toBe('23');
  });

  it('flat zero-regression: with NO in-transit, available stays Остаток − Резерв', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentId: 'P1',
          qty: D(10),
          reservedQty: D(3),
          store: { id: 'S1', name: 'M' },
        },
      ],
      positions: [],
      products: [{ id: 'P1', name: 'P', code: null, uom: null }],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', {});
    expect(r.items[0]?.inTransitQty).toBe('0');
    expect(r.items[0]?.available).toBe('7');
    expect(r.summaries.totalAvailable).toBe('7');
  });

  it('flat: qty=0 reserved=0 but in-transit>0 → available = in-transit (the old qty===0 short-circuit bug)', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentId: 'P1',
          qty: D(0),
          reservedQty: D(0),
          store: { id: 'S1', name: 'M' },
        },
      ],
      positions: [
        {
          assortmentId: 'P1',
          quantity: D(55),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S1' },
        },
      ],
      products: [{ id: 'P1', name: 'P', code: null, uom: null }],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', {});
    expect(r.items[0]?.available).toBe('55');
    expect(r.items[0]?.inTransitQty).toBe('55');
  });

  it('grouped: in-transit summed across stores → moysklad worked example 27 − 1 + 55 = 81', async () => {
    const { svc } = makeService({
      grouped: [
        {
          assortmentKind: 'product',
          assortmentId: 'P1',
          _sum: { qty: D(27), reservedQty: D(1) },
        },
      ],
      positions: [
        {
          assortmentId: 'P1',
          quantity: D(30),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S1' },
        },
        {
          assortmentId: 'P1',
          quantity: D(25),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S2' },
        },
      ],
      products: [{ id: 'P1', name: 'P', code: null, uom: null }],
    });
    const r = await svc.stockBalanceReport('acc', { groupBy: 'product' });
    expect(r.items[0]?.inTransitQty).toBe('55');
    expect(r.items[0]?.available).toBe('81');
    expect(r.summaries.totalInTransit).toBe('55');
    expect(r.summaries.totalAvailable).toBe('81');
  });

  it('variant/bundle Stock rows never collide with product POs (key namespacing)', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentKind: 'variant',
          assortmentId: 'P1', // same id as the product PO below, different kind
          qty: D(4),
          reservedQty: D(0),
          store: { id: 'S1', name: 'M' },
        },
      ],
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: 'P1',
          quantity: D(9),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S1' },
        },
      ],
      products: [],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', { assortmentKind: 'variant' });
    // variant row must NOT pick up the product PO's in-transit
    expect(r.items[0]?.inTransitQty).toBe('0');
    expect(r.items[0]?.available).toBe('4');
  });
});

/**
 * FAZA 27a (`PERF-10`) — «jim kesish» bug-klassi.
 *
 * Ombor-qoldiq hisoboti grouped rejimda `groupBy … take` qilib, `search` va
 * `hideEmpty` ni SHUNDAN KEYIN JS'da qo'llardi: qidirilgan tovar top-N qoldiq
 * ichiga tushmasa — hisobot uni «yo'q» deb ko'rsatardi, `hideEmpty` esa
 * sahifani kesib, to'la bo'lishi mumkin bo'lgan sahifani kaltalatardi. `total`
 * ham sahifa uzunligi edi (paginatsiya qurish imkonsiz).
 *
 * Bu yerdagi Prisma-dubl DB semantikasini TAQLID qiladi (where → having →
 * order by qty desc → skip/take), shuning uchun «filtr take'dan oldinmi yoki
 * keyinmi» farqi testda KO'RINADI.
 */

const ACC = 'acc-1';
const STORE = 'store-1';

const dec = (n: number | string) => new Prisma.Decimal(n);

interface CannedStockRow {
  assortmentId: string;
  name: string;
  code?: string | null;
  qty: number;
  reservedQty?: number;
  storeId?: string;
  assortmentKind?: string;
}

interface GroupAcc {
  assortmentKind: string;
  assortmentId: string;
  qty: number;
  reservedQty: number;
}

/** `{ qty: { _sum: { not: 0 } } }` / `{ OR: [...] }` shakllarini baholaydi. */
// biome-ignore lint/suspicious/noExplicitAny: test-dubl Prisma having shaklini dinamik o'qiydi
function havingPasses(having: any, g: GroupAcc): boolean {
  if (!having) return true;
  // biome-ignore lint/suspicious/noExplicitAny: yuqoridagi bilan bir sabab
  if (having.OR) return having.OR.some((h: any) => havingPasses(h, g));
  if (having.qty?._sum?.not !== undefined) return g.qty !== Number(having.qty._sum.not);
  if (having.reservedQty?._sum?.not !== undefined) {
    return g.reservedQty !== Number(having.reservedQty._sum.not);
  }
  return true;
}

function makeCapService(rows: CannedStockRow[], rawGroupCount = 0) {
  const full = rows.map((r) => ({
    assortmentKind: r.assortmentKind ?? 'product',
    assortmentId: r.assortmentId,
    storeId: r.storeId ?? STORE,
    qty: r.qty,
    reservedQty: r.reservedQty ?? 0,
    name: r.name,
    code: r.code ?? null,
  }));

  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const matchWhere = (w: any) => {
    let src = full;
    if (w?.storeId) src = src.filter((r) => r.storeId === w.storeId);
    if (w?.assortmentKind) src = src.filter((r) => r.assortmentKind === w.assortmentKind);
    if (w?.assortmentId) {
      const f = w.assortmentId;
      src =
        typeof f === 'string'
          ? src.filter((r) => r.assortmentId === f)
          : src.filter((r) => (f.in as string[]).includes(r.assortmentId));
    }
    return src;
  };

  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const groupBy = vi.fn(async (args: any) => {
    const src = matchWhere(args.where);
    const agg = new Map<string, GroupAcc>();
    for (const r of src) {
      const k = `${r.assortmentKind}:${r.assortmentId}`;
      const cur = agg.get(k) ?? {
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        qty: 0,
        reservedQty: 0,
      };
      cur.qty += r.qty;
      cur.reservedQty += r.reservedQty;
      agg.set(k, cur);
    }
    let out = [...agg.values()].filter((g) => havingPasses(args.having, g));
    out.sort((a, b) => b.qty - a.qty);
    if (args.skip) out = out.slice(args.skip);
    if (args.take != null) out = out.slice(0, args.take);
    return out.map((g) => ({
      assortmentKind: g.assortmentKind,
      assortmentId: g.assortmentId,
      _sum: { qty: dec(g.qty), reservedQty: dec(g.reservedQty) },
    }));
  });

  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const stockFindMany = vi.fn(async (args: any) => {
    let src = matchWhere(args.where);
    src = [...src].sort(
      (a, b) => a.storeId.localeCompare(b.storeId) || a.assortmentId.localeCompare(b.assortmentId),
    );
    if (args.skip) src = src.slice(args.skip);
    if (args.take != null) src = src.slice(0, args.take);
    return src.map((r) => ({
      storeId: r.storeId,
      assortmentKind: r.assortmentKind,
      assortmentId: r.assortmentId,
      qty: dec(r.qty),
      reservedQty: dec(r.reservedQty),
      store: { id: r.storeId, name: `Ombor ${r.storeId}` },
    }));
  });

  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const stockCount = vi.fn(async (args: any) => matchWhere(args.where).length);

  // biome-ignore lint/suspicious/noExplicitAny: Prisma args shakli testda dinamik
  const productFindMany = vi.fn(async (args: any) => {
    const w = args.where ?? {};
    const uniq = new Map<string, (typeof full)[number]>();
    for (const r of full) if (!uniq.has(r.assortmentId)) uniq.set(r.assortmentId, r);
    if (w.OR) {
      // biome-ignore lint/suspicious/noExplicitAny: yuqoridagi bilan bir sabab
      const needle = String(w.OR.map((o: any) => o.name?.contains ?? o.code?.contains)[0] ?? '');
      const n = needle.toLowerCase();
      const hits = [...uniq.values()].filter(
        (r) => r.name.toLowerCase().includes(n) || (r.code ?? '').toLowerCase().includes(n),
      );
      return (args.take != null ? hits.slice(0, args.take) : hits).map((r) => ({
        id: r.assortmentId,
      }));
    }
    const ids: string[] = w.id?.in ?? [];
    return [...uniq.values()]
      .filter((r) => ids.includes(r.assortmentId))
      .map((r) => ({ id: r.assortmentId, name: r.name, code: r.code, uom: 'dona' }));
  });

  const queryRaw = vi.fn(async () => [{ count: BigInt(rawGroupCount) }]);

  const client = {
    stock: { groupBy, findMany: stockFindMany, count: stockCount },
    product: { findMany: productFindMany },
    $queryRaw: queryRaw,
  };
  const inTransit = {
    getInTransitMap: vi.fn(async () => new Map()),
    getInTransitByAssortment: vi.fn(async () => new Map()),
  };
  const svc = new StockBalanceService({ client } as never, inTransit as never);
  return { svc, groupBy, stockFindMany, productFindMany, queryRaw };
}

describe('StockBalanceService — grouped rejim, PERF-10', () => {
  it('qidiruv qty-cap tashqarisidagi tovarni ham topadi (pre-filtr, take’dan OLDIN)', async () => {
    const { svc } = makeCapService([
      { assortmentId: 'p1', name: 'Sement M400', qty: 100 },
      { assortmentId: 'p2', name: 'Beton', qty: 90 },
      { assortmentId: 'p3', name: 'Sement qopli', qty: 5 },
      { assortmentId: 'p4', name: 'Gips', qty: 80 },
    ]);
    const r = await svc.stockBalanceReport(ACC, {
      groupBy: 'product',
      limit: 2,
      search: 'Sement',
    });
    // Faqat «Sement» li ikkitasi scope'da qoladi ⇒ ikkalasi ham sahifaga sig'adi.
    expect(r.items.map((i) => i.assortmentId).sort()).toEqual(['p1', 'p3']);
  });

  it('hideEmpty DB-tomonda (having) qo‘llanadi — sahifa kaltalanmaydi', async () => {
    const { svc } = makeCapService([
      { assortmentId: 'p1', name: 'Sement', qty: 100 },
      { assortmentId: 'p2', name: 'Bo‘sh', qty: 0 },
      { assortmentId: 'p3', name: 'Minus', qty: -5 },
      { assortmentId: 'p4', name: 'Gips', qty: 80 },
    ]);
    const r = await svc.stockBalanceReport(ACC, {
      groupBy: 'product',
      limit: 3,
      hideEmpty: true,
    });
    // qty desc: 100, 80, 0, −5. Nol take'dan OLDIN tushib qolsa sahifa to'la 3 bo'ladi.
    expect(r.items.map((i) => i.assortmentId)).toEqual(['p1', 'p4', 'p3']);
  });

  it('total butun-scope agregat-count’idan keladi, sahifa uzunligidan emas', async () => {
    const { svc, queryRaw } = makeCapService(
      [
        { assortmentId: 'p1', name: 'A', qty: 100 },
        { assortmentId: 'p2', name: 'B', qty: 90 },
        { assortmentId: 'p3', name: 'C', qty: 80 },
        { assortmentId: 'p4', name: 'D', qty: 70 },
      ],
      7,
    );
    const r = await svc.stockBalanceReport(ACC, { groupBy: 'product', limit: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(7);
    expect(r.truncated).toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('offset grouped rejimda keyingi sahifani beradi', async () => {
    const { svc } = makeCapService(
      [
        { assortmentId: 'p1', name: 'A', qty: 100 },
        { assortmentId: 'p2', name: 'B', qty: 90 },
        { assortmentId: 'p3', name: 'C', qty: 80 },
        { assortmentId: 'p4', name: 'D', qty: 70 },
      ],
      4,
    );
    const r = await svc.stockBalanceReport(ACC, { groupBy: 'product', limit: 2, offset: 2 });
    expect(r.items.map((i) => i.assortmentId)).toEqual(['p3', 'p4']);
    expect(r.total).toBe(4);
    expect(r.truncated).toBe(false);
  });

  it('qidiruv pre-filtri o‘z cap’iga urilsa truncated bayrog‘i ko‘tariladi', async () => {
    const many: CannedStockRow[] = Array.from({ length: PRODUCT_SEARCH_CAP + 5 }, (_, i) => ({
      assortmentId: `p${i}`,
      name: `Sement ${i}`,
      qty: 1,
    }));
    const { svc } = makeCapService(many, PRODUCT_SEARCH_CAP);
    const r = await svc.stockBalanceReport(ACC, {
      groupBy: 'product',
      limit: 5,
      search: 'Sement',
    });
    expect(r.truncated).toBe(true);
  });
});

describe('StockBalanceService — flat rejim, PERF-10', () => {
  it('offset sahifalaydi (ilgari umuman qo‘llab-quvvatlanmasdi)', async () => {
    const { svc } = makeCapService([
      { assortmentId: 'a1', name: 'A', qty: 10 },
      { assortmentId: 'a2', name: 'B', qty: 20 },
      { assortmentId: 'a3', name: 'C', qty: 30 },
      { assortmentId: 'a4', name: 'D', qty: 40 },
    ]);
    const r = await svc.stockBalanceReport(ACC, { limit: 2, offset: 2 });
    expect(r.items.map((i) => i.assortmentId)).toEqual(['a3', 'a4']);
    expect(r.total).toBe(4);
    expect(r.truncated).toBe(false);
  });

  it('oxirgi sahifadan keyin qator qolsa truncated true', async () => {
    const { svc } = makeCapService([
      { assortmentId: 'a1', name: 'A', qty: 10 },
      { assortmentId: 'a2', name: 'B', qty: 20 },
      { assortmentId: 'a3', name: 'C', qty: 30 },
    ]);
    const r = await svc.stockBalanceReport(ACC, { limit: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(3);
    expect(r.truncated).toBe(true);
  });
});
