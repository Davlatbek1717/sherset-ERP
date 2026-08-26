import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SupplyService } from './supply.service.js';

/**
 * K5/2 — PRIYOMKA kelgan rulonlarni bo'lak reyestriga tushiradi.
 *
 * Qo'riqlanadigan shartnoma:
 *   1. **bayroq O'CHIQ tovarda reyestrga UMUMAN yozilmaydi** — bugungi jonli
 *      xulq (bayroq hech qayerda yoqilmagan) bir bayt ham o'zgarmaydi;
 *   2. bayroq yoqilganda har rulon `whole=true`, YORLIQSIZ qator bo'ladi (K-Q3);
 *   3. bo'lak (yorliqli yoki «?») RAD etiladi — priyomkada yorliq bosish
 *      oqimi yo'q, ya'ni bo'lak javondan topilmaydigan bo'lib qolardi;
 *   4. Σ tarkib ≠ `quantity` bo'lsa 400 — reyestr va qoldiq zid bo'lmasin;
 *   5. qoldiq deltalari (`applyDeltas`) AVVALGIDEK — reyestr ularga tegmaydi.
 */

const ACC = 'acc-1';
const STORE = 'store-1';
const PRODUCT = 'prod-1';
const dec = (v: string) => ({ toString: () => v }) as never;

function makeWorld(opts: { pieceEntry: string | null; pieceTracked: boolean; quantity?: string }) {
  const pieceCreates: unknown[] = [];
  const applyDeltas = vi.fn(async () => undefined);

  const doc = {
    id: 'sup-1',
    accountId: ACC,
    agentId: 'agent-1',
    organizationId: 'org-1',
    storeId: STORE,
    state: 'draft',
    applicable: false,
    approvalStage: 'none',
    deletedAt: null,
    currency: 'UZS',
    rateValue: 100_000_000n,
    vatEnabled: false,
    vatIncluded: false,
    sumMinor: 0n,
    overheadSumMinor: 0n,
    overheadDistribution: 'WEIGHT',
    purchaseOrderId: null,
    postedAt: null,
    positions: [
      {
        id: 'sp-1',
        assortmentKind: 'product',
        assortmentId: PRODUCT,
        quantity: dec(opts.quantity ?? '1250'),
        priceMinor: 0n,
        discount: dec('0'),
        vat: null,
        vatEnabled: false,
        cellId: 'cell-A',
        purchaseOrderPositionId: null,
        pieceEntry: opts.pieceEntry,
        product: {
          id: PRODUCT,
          name: 'UzKabel VVG 2x2.5',
          code: 'K-1',
          uom: 'm',
          weightG: null,
          volumeML: null,
          pieceTracked: opts.pieceTracked,
        },
      },
    ],
  };

  const client: Record<string, unknown> = {
    supply: {
      findFirst: vi.fn(async () => doc),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => doc),
    },
    supplyPosition: { update: vi.fn(async () => ({})) },
    stockPiece: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async (args: unknown) => {
        pieceCreates.push(args);
        return { count: 0 };
      }),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));

  const svc = new SupplyService(
    { client } as never,
    { applyDeltas } as never,
    { applyReceipt: vi.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    { fireForEvent: vi.fn() } as never,
    { emit: vi.fn() } as never,
    { applyDelta: vi.fn(async () => undefined) } as never,
    { require: vi.fn(async () => 'ALL') } as never,
  );

  return { svc, pieceCreates, applyDeltas, client };
}

// ---------------------------------------------------------------------------
describe('K5/2 — bayroq O`CHIQ: hech narsa o`zgarmaydi', () => {
  it('🔴 tarkib KIRITILGAN, lekin bayroq o`chiq — reyestrga yozilmaydi', async () => {
    const w = makeWorld({ pieceEntry: '250x5', pieceTracked: false });
    await w.svc.transition(ACC, 'user', 'sup-1', 'post');
    expect(w.pieceCreates).toEqual([]);
    // Qoldiq esa avvalgidek kiritildi.
    expect(w.applyDeltas).toHaveBeenCalledTimes(1);
  });

  it('tarkibsiz qator — reyestrga yozilmaydi', async () => {
    const w = makeWorld({ pieceEntry: null, pieceTracked: true });
    await w.svc.transition(ACC, 'user', 'sup-1', 'post');
    expect(w.pieceCreates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('K5/2 — bayroq YOQILGAN: rulonlar reyestrga tushadi', () => {
  it('«250x5» → 5 ta YORLIQSIZ butun rulon, sanalgan yacheykaga', async () => {
    const w = makeWorld({ pieceEntry: '250x5', pieceTracked: true });
    await w.svc.transition(ACC, 'user', 'sup-1', 'post');
    const rows = (w.pieceCreates[0] as { data: unknown[] }).data as Array<{
      whole: boolean;
      label: string | null;
      length: string;
      cellId: string;
      storeId: string;
    }>;
    expect(rows).toHaveLength(5);
    expect(
      rows.every((r) => r.whole && r.label === null && r.length === '250' && r.cellId === 'cell-A'),
    ).toBe(true);
    expect(rows[0]?.storeId).toBe(STORE);
  });

  it('🔴 qoldiq deltalari AVVALGIDEK — reyestr ularga tegmaydi', async () => {
    const w = makeWorld({ pieceEntry: '250x5', pieceTracked: true });
    await w.svc.transition(ACC, 'user', 'sup-1', 'post');
    const deltas = w.applyDeltas.mock.calls[0]?.[3] as Array<{ qtyDelta: string; cellId: string }>;
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ qtyDelta: '1250', cellId: 'cell-A' });
  });

  it('🔴 BO`LAK kiritilsa post 400 oladi', async () => {
    const w = makeWorld({ pieceEntry: '250x4+?:250', pieceTracked: true });
    await expect(w.svc.transition(ACC, 'user', 'sup-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
    expect(w.pieceCreates).toEqual([]);
  });

  it('🔴 Σ tarkib ≠ quantity bo`lsa 400', async () => {
    // 250×5 = 1250, qator esa 1000 deydi.
    const w = makeWorld({ pieceEntry: '250x5', pieceTracked: true, quantity: '1000' });
    await expect(w.svc.transition(ACC, 'user', 'sup-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });
});
