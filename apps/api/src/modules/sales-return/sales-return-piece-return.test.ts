import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SalesReturnService } from './sales-return.service.js';

/**
 * K5/3 — VOZVRAT qaytgan bo'lakni reyestrga qaytaradi.
 *
 * Qo'riqlanadigan shartnoma:
 *   1. **bayroq O'CHIQ tovarda reyestrga UMUMAN so'rov ketmaydi**;
 *   2. yorlig'i tanilgan bo'lak AYNAN o'sha qator bilan tiklanadi —
 *      mijozdagi yorliq raqami tizimdagi o'sha bo'lakka ishora qilishi SHART
 *      (K-reja 7.3), aks holda skaner boshqa bo'lakni ochardi;
 *   3. tiklangan bo'lak qaytarilayotgan YACHEYKAGA ko'chadi;
 *   4. qoldiq deltalari AVVALGIDEK — reyestr ularga tegmaydi.
 */

const ACC = 'acc-1';
const dec = (v: string) => ({ toString: () => v }) as never;

function makeHarness(opts: {
  pieceEntry: string | null;
  pieceTracked: boolean;
  found?: unknown[];
  quantity?: string;
}) {
  const applyDeltas = vi.fn(async () => undefined);
  const pieceUpdates: unknown[] = [];
  const pieceCreates: unknown[] = [];
  const pieceFindMany = vi.fn(async () => opts.found ?? []);

  const tx = {
    salesReturn: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => ({ payedSumMinor: 0n })),
      update: vi.fn(async () => ({
        id: 'sr-1',
        state: 'posted',
        agentId: 'agent-1',
        sumMinor: 0n,
        postedAt: new Date(),
      })),
    },
    salesReturnPosition: { update: vi.fn(async () => ({})), groupBy: vi.fn(async () => []) },
    demandPosition: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    stockPiece: {
      findMany: pieceFindMany,
      findFirst: vi.fn(async () => null),
      createMany: vi.fn(async (args: unknown) => {
        pieceCreates.push(args);
        return { count: 0 };
      }),
      update: vi.fn(async (args: unknown) => {
        pieceUpdates.push(args);
        return {};
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };

  const existing = {
    id: 'sr-1',
    state: 'draft',
    applicable: false,
    storeId: 'store-1',
    agentId: 'agent-1',
    currency: 'UZS',
    organizationId: 'org-1',
    customerOrderId: null,
    sumMinor: 0n,
    positions: [
      {
        id: 'pos-1',
        assortmentKind: 'product',
        assortmentId: 'prod-1',
        quantity: dec(opts.quantity ?? '180'),
        cellId: 'cell-A',
        costMinor: 0n,
        demandPositionId: null,
        pieceEntry: opts.pieceEntry,
        product: { id: 'prod-1', name: 'Kabel', pieceTracked: opts.pieceTracked },
      },
    ],
  };

  const prisma = {
    client: { $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) },
  };
  const stock = {
    applyDeltas,
    lockBalances: vi.fn(async () => new Map([['prod-1', { qty: '0', costBalanceMinor: '0' }]])),
  };
  const svc = new SalesReturnService(
    prisma as never,
    stock as never,
    {} as never,
    {} as never,
    { fireForEvent: vi.fn() } as never,
    { emit: vi.fn() } as never,
    { applyDelta: vi.fn(async () => undefined) } as never,
  );
  vi.spyOn(svc, 'findById').mockResolvedValue(existing as never);

  return { svc, pieceUpdates, pieceCreates, pieceFindMany, applyDeltas };
}

// ---------------------------------------------------------------------------
describe('K5/3 — bayroq O`CHIQ: hech narsa o`zgarmaydi', () => {
  it('🔴 tarkib KIRITILGAN, lekin bayroq o`chiq — reyestrga so`rov ketmaydi', async () => {
    const h = makeHarness({ pieceEntry: 'BLK-000041:180', pieceTracked: false });
    await h.svc.transition(ACC, 'user', 'sr-1', 'post');
    expect(h.pieceFindMany).not.toHaveBeenCalled();
    expect(h.pieceUpdates).toEqual([]);
    // Qoldiq esa avvalgidek qaytdi.
    expect(h.applyDeltas).toHaveBeenCalledTimes(1);
  });

  it('tarkibsiz qator — reyestrga tegilmaydi', async () => {
    const h = makeHarness({ pieceEntry: null, pieceTracked: true });
    await h.svc.transition(ACC, 'user', 'sr-1', 'post');
    expect(h.pieceFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('K5/3 — bayroq YOQILGAN: bo`lak reyestrga qaytadi', () => {
  it('🔴 yorlig`i tanilgan bo`lak AYNAN o`sha qator bilan tiklanadi', async () => {
    const h = makeHarness({
      pieceEntry: 'BLK-000041:180',
      pieceTracked: true,
      found: [{ id: 'p1', label: 'BLK-000041', status: 'consumed', length: dec('180') }],
    });
    await h.svc.transition(ACC, 'user', 'sr-1', 'post');
    const call = h.pieceUpdates[0] as { where: { id: string }; data: Record<string, unknown> };
    expect(call.where.id).toBe('p1');
    expect(call.data).toMatchObject({
      status: 'active',
      consumedReason: null,
      length: '180',
      // Omborchi tovarni qayerga qo'ysa reyestr o'sha yerni ko'rsatadi.
      storeId: 'store-1',
      cellId: 'cell-A',
    });
    expect(h.pieceCreates).toEqual([]);
  });

  it('yorliqsiz qaytdi — yangi qator + yangi yorliq', async () => {
    const h = makeHarness({ pieceEntry: '?:180', pieceTracked: true });
    await h.svc.transition(ACC, 'user', 'sr-1', 'post');
    const rows = (h.pieceCreates[0] as { data: Array<{ label: string; whole: boolean }> }).data;
    expect(rows[0]?.label).toBe('BLK-000001');
    expect(rows[0]?.whole).toBe(false);
  });

  it('🔴 qoldiq deltalari AVVALGIDEK — reyestr ularga tegmaydi', async () => {
    const h = makeHarness({ pieceEntry: '?:180', pieceTracked: true });
    await h.svc.transition(ACC, 'user', 'sr-1', 'post');
    const deltas = h.applyDeltas.mock.calls[0]?.[3] as Array<{ qtyDelta: string; cellId: string }>;
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ qtyDelta: '180', cellId: 'cell-A' });
  });

  it('🔴 Σ tarkib ≠ quantity bo`lsa 400', async () => {
    const h = makeHarness({ pieceEntry: '?:150', pieceTracked: true, quantity: '180' });
    await expect(h.svc.transition(ACC, 'user', 'sr-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });
});
