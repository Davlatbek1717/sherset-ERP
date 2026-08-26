import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StockService } from '../stock/stock.service.js';
import { InventoryService } from './inventory.service.js';

/**
 * K5/1 — SANASH bo'lak reyestrini hizalaydi (`inventory.cell.test.ts` naqshi:
 * haqiqiy servis + soxta `tx`, DB kerak emas).
 *
 * Qo'riqlanadigan shartnoma:
 *   1. **bayroq O'CHIQ tovarda reyestrga UMUMAN so'rov ketmaydi** — ya'ni
 *      bugungi jonli xulq (bayroq hech qayerda yoqilmagan) o'zgarmaydi;
 *   2. bayroq yoqilgan tovarda reyestr sanoq natijasiga tenglashadi va bu
 *      qoldiq deltalari bilan BIR tranzaksiyada bo'ladi;
 *   3. Σ tarkib ≠ `actualQty` bo'lsa hujjat 400 oladi (reyestr va qoldiq
 *      hech qachon bir-biriga zid holda post bo'lmasin);
 *   4. reyestr yo'li QOLDIQ hisobiga TEGMAYDI — variance avvalgidek.
 */

const dec = (n: string | number) => ({ toString: () => String(n) }) as never;

interface FakePosition {
  id: string;
  assortmentKind: string;
  assortmentId: string;
  actualQty: ReturnType<typeof dec>;
  varianceQty: ReturnType<typeof dec>;
  costMinor: bigint | null;
  cellId: string | null;
  pieceEntry: string | null;
}

function makeTx(opts: { existingPieces?: unknown[]; maxLabel?: string | null } = {}) {
  const cellUpserts: Array<{ cellId: string; qty: string }> = [];
  const pieceCreates: unknown[] = [];
  const pieceUpdates: unknown[] = [];
  const pieceCloses: unknown[] = [];
  const pieceFindMany = vi.fn(async () => opts.existingPieces ?? []);

  const tx = {
    store: { findMany: vi.fn(async () => []) },
    $queryRaw: vi.fn(async () => []),
    stock: {
      findFirst: vi.fn(async () => ({ qty: dec('100'), costBalanceMinor: 0n })),
      upsert: vi.fn(async () => ({})),
    },
    stockByCell: {
      findUnique: vi.fn(async () => ({ qty: dec('1000') })),
      upsert: vi.fn(
        async (args: { where: Record<string, { cellId: string }>; create: { qty: unknown } }) => {
          const key = Object.values(args.where)[0];
          cellUpserts.push({ cellId: key.cellId, qty: String(args.create.qty) });
          return {};
        },
      ),
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    stockOperation: {
      createMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => []),
    },
    product: { findMany: vi.fn(async () => []) },
    storeCell: { findMany: vi.fn(async () => []) },
    stockPiece: {
      findMany: pieceFindMany,
      findFirst: vi.fn(async () =>
        opts.maxLabel === undefined || opts.maxLabel === null ? null : { label: opts.maxLabel },
      ),
      createMany: vi.fn(async (args: unknown) => {
        pieceCreates.push(args);
        return { count: 0 };
      }),
      update: vi.fn(async (args: unknown) => {
        pieceUpdates.push(args);
        return {};
      }),
      updateMany: vi.fn(async (args: unknown) => {
        pieceCloses.push(args);
        return { count: 0 };
      }),
    },
    inventoryPosition: { update: vi.fn(async () => ({})) },
    inventory: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirstOrThrow: vi.fn(async () => ({ id: 'inv-1', state: 'posted' })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { tx, cellUpserts, pieceCreates, pieceUpdates, pieceCloses, pieceFindMany };
}

function makeService(positions: FakePosition[], tx: unknown, pieceTracked: boolean) {
  const doc = {
    id: 'inv-1',
    storeId: 'store-1',
    deletedAt: null,
    state: 'draft',
    applicable: false,
    positions,
  };
  const prisma = {
    client: {
      inventory: { findFirst: vi.fn(async () => doc) },
      product: {
        findMany: vi.fn(async () => [{ id: 'prod-1', buyPrice: 0n, pieceTracked }]),
      },
      $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    },
  };
  const stock = new StockService({ client: {} } as never);
  return new InventoryService(
    prisma as never,
    stock,
    {} as never,
    { fireForEvent: vi.fn() } as never,
  );
}

const pos = (over: Partial<FakePosition>): FakePosition => ({
  id: 'pos-1',
  assortmentKind: 'product',
  assortmentId: 'prod-1',
  actualQty: dec('1000'),
  varianceQty: dec('0'),
  costMinor: null,
  cellId: 'cell-A',
  pieceEntry: null,
  ...over,
});

// ---------------------------------------------------------------------------
describe('K5/1 — bayroq O`CHIQ: hech narsa o`zgarmaydi', () => {
  it('🔴 tarkibsiz qator — reyestrga so`rov UMUMAN ketmaydi', async () => {
    const t = makeTx();
    const svc = makeService([pos({})], t.tx, false);
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect(t.pieceFindMany).not.toHaveBeenCalled();
    expect(t.pieceCreates).toEqual([]);
  });

  it('🔴 tarkib KIRITILGAN, lekin bayroq o`chiq — reyestrga TEGILMAYDI', async () => {
    // Matn hujjat izi bo'lib saqlanadi, lekin `stock_pieces` ga yozilmaydi:
    // K3/K4 dagi «bayroq o'chiq ⇒ mutlaqo o'zgarmagan» qoidasi.
    const t = makeTx();
    const svc = makeService([pos({ pieceEntry: '250x4' })], t.tx, false);
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect(t.pieceFindMany).not.toHaveBeenCalled();
    expect(t.pieceCreates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('K5/1 — bayroq YOQILGAN: reyestr sanoqqa tenglashadi', () => {
  it('bo`sh reyestrga 4 rulon kiritiladi (250x4 = 1000 = actualQty)', async () => {
    const t = makeTx({ existingPieces: [], maxLabel: null });
    const svc = makeService([pos({ pieceEntry: '250x4' })], t.tx, true);
    await svc.transition('acc', 'user', 'inv-1', 'post');

    const rows = (t.pieceCreates[0] as { data: unknown[] }).data as Array<{
      whole: boolean;
      length: string;
      cellId: string;
      label: string | null;
    }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.whole && r.label === null && r.cellId === 'cell-A')).toBe(true);
  });

  it('doira sanalgan YACHEYKA — boshqa yacheykalarga tegilmaydi', async () => {
    const t = makeTx({ existingPieces: [], maxLabel: null });
    const svc = makeService([pos({ pieceEntry: '250x4' })], t.tx, true);
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect(t.pieceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-1', cellId: 'cell-A', status: 'active' }),
      }),
    );
  });

  it('o`zgarmagan sanoq — reyestrga bir qator ham yozilmaydi', async () => {
    const t = makeTx({
      existingPieces: [
        { id: 'w1', length: dec('250'), whole: true, label: null },
        { id: 'w2', length: dec('250'), whole: true, label: null },
      ],
      maxLabel: null,
    });
    const svc = makeService([pos({ pieceEntry: '250x2', actualQty: dec('500') })], t.tx, true);
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect(t.pieceCreates).toEqual([]);
    expect(t.pieceUpdates).toEqual([]);
    expect(t.pieceCloses).toEqual([]);
  });

  it('sanashda topilmagan bo`lak `recount` sababi bilan yopiladi', async () => {
    const t = makeTx({
      existingPieces: [
        { id: 'w1', length: dec('250'), whole: true, label: null },
        { id: 'p1', length: dec('250'), whole: false, label: 'BLK-000041' },
      ],
      maxLabel: 'BLK-000041',
    });
    const svc = makeService([pos({ pieceEntry: '250', actualQty: dec('250') })], t.tx, true);
    await svc.transition('acc', 'user', 'inv-1', 'post');
    const close = t.pieceCloses[0] as { data: { consumedReason: string } };
    expect(close.data.consumedReason).toBe('recount');
  });

  it('yacheykasiz qator (`cellId = null`) ham qo`llanadi', async () => {
    const t = makeTx({ existingPieces: [], maxLabel: null });
    const svc = makeService([pos({ cellId: null, pieceEntry: '250x4' })], t.tx, true);
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect((t.pieceCreates[0] as { data: Array<{ cellId: null }> }).data[0]?.cellId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('K5/1 — Σ tarkib === actualQty SHART', () => {
  it('🔴 farq bo`lsa post 400 oladi (reyestr va qoldiq zid bo`lmaydi)', async () => {
    const t = makeTx({ existingPieces: [], maxLabel: null });
    // 250×4 = 1000, qator esa 900 deydi.
    const svc = makeService([pos({ pieceEntry: '250x4', actualQty: dec('900') })], t.tx, true);
    await expect(svc.transition('acc', 'user', 'inv-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('yaroqsiz matn ham post`ni to`xtatadi', async () => {
    const t = makeTx({ existingPieces: [], maxLabel: null });
    const svc = makeService([pos({ pieceEntry: '250+abc' })], t.tx, true);
    await expect(svc.transition('acc', 'user', 'inv-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('`create` ham tekshiradi — erta signal (bayroqdan qat`i nazar)', async () => {
    const prisma = {
      client: {
        organization: { findFirst: vi.fn(async () => ({ id: 'org-1' })) },
        store: { findFirst: vi.fn(async () => ({ id: 'store-1' })) },
        inventory: { create: vi.fn() },
      },
    };
    const stock = { assertCellsInStore: vi.fn(async () => undefined) };
    const svc = new InventoryService(
      prisma as never,
      stock as never,
      { validateAndNormalize: vi.fn(async () => ({})) } as never,
      { fireForEvent: vi.fn() } as never,
    );
    await expect(
      svc.create('acc', 'user', {
        organizationId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        positions: [
          {
            assortmentId: '33333333-3333-4333-8333-333333333333',
            actualQty: '900',
            pieceEntry: '250x4',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.inventory.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('K5/1 — QOLDIQ hisobiga tegilmaydi', () => {
  it('reyestr yo`li variance hisobini o`zgartirmaydi', async () => {
    // expected (StockByCell) = 1000, actual = 1000 ⇒ variance 0 ⇒ delta yo'q.
    // Reyestr esa 4 ta rulon bilan to'ladi — ikkalasi mustaqil.
    const t = makeTx({ existingPieces: [], maxLabel: null });
    const svc = makeService([pos({ pieceEntry: '250x4' })], t.tx, true);
    await svc.transition('acc', 'user', 'inv-1', 'post');
    expect(t.cellUpserts).toEqual([]);
    expect(t.pieceCreates).toHaveLength(1);
  });
});
