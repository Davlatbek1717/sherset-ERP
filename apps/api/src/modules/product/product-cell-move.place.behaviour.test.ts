import { describe, expect, it, vi } from 'vitest';
import { StockService } from '../stock/stock.service.js';
import { ProductCellMoveService } from './product-cell-move.service.js';

/**
 * F7 — place() ko'p-manbali joylashtirish xulqi (fake Prisma, DB yo'q).
 *
 * Qo'riqlanadigan shartnoma:
 *   - manba tartibi: maqsad ombor o'z qoldig'i → hovuz (`__unassignedSource`)
 *     → uy-yacheyka ombori (eski yo'l);
 *   - hovuz belgilangan bo'lsa uy-yacheyka MAJBURIY EMAS;
 *   - hovuzsiz akkauntda eski xatolar/xulq saqlanadi;
 *   - jami yetmasa butun amal 400.
 */

const PID = 'prod-1';
const CELL_T = '22222222-2222-4222-8222-222222222222';
const CELL_H = '33333333-3333-4333-8333-333333333333';

interface Ledger {
  storeId: string;
  cellId: string | null;
  qtyDelta: unknown;
  costDeltaMinor: bigint | null;
  docType: string;
}

function makeWorld(opts: {
  productAttrs?: Record<string, unknown>;
  pool?: { id: string };
  /** storeId → {qty, cost, assigned} — lockBalances + Σyacheyka. */
  stores?: Record<string, { qty: string; cost: string; assigned?: string }>;
  /** toCellId → storeId. */
  cellStore?: Record<string, string>;
  /** uy-yacheyka nomi → {id, storeId}. */
  homeCells?: Record<string, { id: string; storeId: string }>;
}) {
  const ledger: Ledger[] = [];
  const client = {
    product: {
      findFirst: vi.fn(async () => ({ id: PID, attributes: opts.productAttrs ?? {} })),
      findMany: vi.fn(async () => []),
    },
    store: {
      findMany: vi.fn(async () =>
        opts.pool ? [{ id: opts.pool.id, name: 'Taqsimlanmagan' }] : [],
      ),
    },
    storeCell: {
      findFirst: vi.fn(async (args: { where: { id?: string; name?: string } }) => {
        if (args.where.id) {
          const storeId = opts.cellStore?.[args.where.id];
          return storeId ? { storeId } : null;
        }
        if (args.where.name) {
          const hc = opts.homeCells?.[args.where.name];
          return hc ? { id: hc.id, storeId: hc.storeId } : null;
        }
        return null;
      }),
      findMany: vi.fn(async () => []),
    },
    stockByCell: {
      groupBy: vi.fn(async (args: { where: { storeId: string } }) => {
        const s = opts.stores?.[args.where.storeId];
        return s?.assigned
          ? [
              {
                assortmentKind: 'product',
                assortmentId: PID,
                _sum: { qty: { toString: () => s.assigned } },
              },
            ]
          : [];
      }),
      upsert: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
    stock: { upsert: vi.fn(async () => ({})) },
    stockOperation: {
      createMany: vi.fn(async (args: { data: Ledger[] }) => {
        ledger.push(...args.data);
        return { count: args.data.length };
      }),
    },
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
      const storeId = String(values[1]);
      const s = opts.stores?.[storeId];
      if (!s) return [];
      return [
        {
          account_id: 'acc',
          store_id: storeId,
          assortment_kind: 'product',
          assortment_id: PID,
          qty: s.qty,
          reserved_qty: '0',
          cost_balance_minor: s.cost,
        },
      ];
    }),
    $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(client)),
  };
  const stock = new StockService({ client: {} } as never);
  const svc = new ProductCellMoveService({ client } as never, stock);
  return { svc, ledger };
}

describe('place() — F7 ko`p-manbali joylashtirish', () => {
  it('hovuz qoplaydi, uy-yacheykasiz ham ishlaydi (cross, cost ko`chadi)', async () => {
    const { svc, ledger } = makeWorld({
      pool: { id: 'pool-1' },
      stores: { 'pool-1': { qty: '10', cost: '1000' }, 'store-T': { qty: '0', cost: '0' } },
      cellStore: { [CELL_T]: 'store-T' },
    });
    const res = (await svc.place('acc', 'user', PID, { toCellId: CELL_T, qty: '4' })) as {
      crossStore: boolean;
      sources: Array<{ storeId: string; qty: string }>;
    };
    expect(res.crossStore).toBe(true);
    expect(res.sources).toEqual([{ storeId: 'pool-1', qty: '4', crossStore: true }]);
    expect(ledger.map((l) => [l.docType, l.storeId, String(l.qtyDelta), l.costDeltaMinor])).toEqual(
      [
        ['cell_place', 'pool-1', '-4', -400n],
        ['cell_place', 'store-T', '4', 400n],
      ],
    );
    expect(ledger[1]?.cellId).toBe(CELL_T);
  });

  it('maqsad omborning o`z qoldig`i hovuzdan USTUN (Move bilan kelgan tovar)', async () => {
    const { svc, ledger } = makeWorld({
      pool: { id: 'pool-1' },
      stores: {
        'store-T': { qty: '20', cost: '0', assigned: '15' }, // remainder 5
        'pool-1': { qty: '50', cost: '0' },
      },
      cellStore: { [CELL_T]: 'store-T' },
    });
    await svc.place('acc', 'user', PID, { toCellId: CELL_T, qty: '5' });
    expect(ledger.map((l) => [l.storeId, String(l.qtyDelta)])).toEqual([
      ['store-T', '-5'],
      ['store-T', '5'],
    ]);
    expect(ledger[0]?.costDeltaMinor).toBeNull();
  });

  it('manbalar birgalikda yetmasa 400, hech narsa yozilmaydi', async () => {
    const { svc, ledger } = makeWorld({
      pool: { id: 'pool-1' },
      stores: { 'pool-1': { qty: '2', cost: '0' }, 'store-T': { qty: '0', cost: '0' } },
      cellStore: { [CELL_T]: 'store-T' },
    });
    await expect(svc.place('acc', 'user', PID, { toCellId: CELL_T, qty: '5' })).rejects.toThrow(
      "Yacheykada yetarli miqdor yo'q",
    );
    expect(ledger).toEqual([]);
  });

  it('hovuzsiz akkaunt: uy-yacheyka talabi va eski cross-xulq saqlanadi', async () => {
    // uy-yacheykasiz — eski xato
    const w1 = makeWorld({ cellStore: { [CELL_T]: 'store-T' } });
    await expect(w1.svc.place('acc', 'user', PID, { toCellId: CELL_T, qty: '1' })).rejects.toThrow(
      'Asosiy yacheyka belgilanmagan',
    );

    // uy-yacheyka bor — remainder uy omboridan cross ko'chadi
    const w2 = makeWorld({
      productAttrs: { __yacheyka: '02-01-01-01' },
      homeCells: { '02-01-01-01': { id: CELL_H, storeId: 'store-H' } },
      stores: { 'store-H': { qty: '10', cost: '500' }, 'store-T': { qty: '0', cost: '0' } },
      cellStore: { [CELL_T]: 'store-T' },
    });
    await w2.svc.place('acc', 'user', PID, { toCellId: CELL_T, qty: '2' });
    expect(w2.ledger.map((l) => [l.storeId, String(l.qtyDelta), l.costDeltaMinor])).toEqual([
      ['store-H', '-2', -100n],
      ['store-T', '2', 100n],
    ]);
  });

  it('maqsad yacheyka uy-yacheykaning o`zi bo`lsa 400 (eski guard)', async () => {
    const { svc } = makeWorld({
      productAttrs: { __yacheyka: '02-01-01-01' },
      homeCells: { '02-01-01-01': { id: CELL_H, storeId: 'store-H' } },
      stores: { 'store-H': { qty: '10', cost: '0' } },
      cellStore: { [CELL_H]: 'store-H' },
    });
    await expect(svc.place('acc', 'user', PID, { toCellId: CELL_H, qty: '1' })).rejects.toThrow(
      'Boshqa yacheyka tanlang',
    );
  });
});
