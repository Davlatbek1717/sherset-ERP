import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { InternalOrderService } from './internal-order.service.js';

interface Position {
  id?: string;
  position: number;
  assortmentKind: string;
  assortmentId: string;
  productId: string | null;
  quantity: { toString: () => string } | string;
  movedQuantity?: { toString: () => string } | string;
  priceMinor: bigint | null;
  vat: number | null;
  vatEnabled: boolean;
}

interface Row {
  id: string;
  name: string;
  accountId: string;
  organizationId: string;
  storeId: string;
  applicable: boolean;
  state: string;
  sumMinor: bigint;
  vatSumMinor: bigint;
  currency: string;
  rateValue: bigint;
  description: string | null;
  externalCode: string | null;
  deletedAt: Date | null;
  positions: Position[];
}

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'io-1',
    name: 'IO-2026-00001',
    accountId: 'acc-1',
    organizationId: '00000000-0000-0000-0000-000000000010',
    storeId: '00000000-0000-0000-0000-000000000020',
    applicable: false,
    state: 'draft',
    sumMinor: 0n,
    vatSumMinor: 0n,
    currency: 'UZS',
    rateValue: 100_000_000n,
    description: null,
    externalCode: null,
    deletedAt: null,
    positions: [],
    ...overrides,
  };
}

function makePrismaMock(state: { rows: Row[] }) {
  const findFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where ?? {};
    return (
      state.rows.find((r) => {
        if (w.id && r.id !== w.id) return false;
        if (w.deletedAt === null && r.deletedAt !== null) return false;
        return true;
      }) ?? null
    );
  });
  const create = vi.fn(async (args: { data: Partial<Row> }) => {
    const row = makeRow(args.data);
    state.rows.push(row);
    return row;
  });
  const update = vi.fn(async (args: { where: { id: string }; data: Partial<Row> }) => {
    const row = state.rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });
  const createMany = vi.fn(async (args: { data: Position[] }) => {
    return { count: args.data.length };
  });
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const findUniqueOrThrow = vi.fn(async (args: { where: { id: string } }) => {
    const row = state.rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    return row;
  });

  const internalOrder = {
    findFirst,
    findUnique: findFirst,
    findUniqueOrThrow,
    create,
    update,
    count: vi.fn(),
    // allocateDocumentNumber's seed closure reads the current max via findMany
    // (select {name}) — must return an iterable (was a bare vi.fn() → undefined
    // → "rows is not iterable" in every create test).
    findMany: vi.fn(async () => state.rows),
  };
  const internalOrderPosition = { createMany, deleteMany };
  const auditLog = { create: vi.fn() };
  const $transaction = vi.fn(
    async (
      fn: (tx: {
        internalOrder: typeof internalOrder;
        internalOrderPosition: typeof internalOrderPosition;
      }) => Promise<unknown>,
    ) => fn({ internalOrder, internalOrderPosition }),
  );
  return {
    client: {
      internalOrder,
      internalOrderPosition,
      auditLog,
      $transaction,
      documentSequence: mockDocumentSequence(),
      // H4 P1 create-stamp: mock returns no employee → groupId resolves null.
      employee: { findUnique: vi.fn(async () => null) },
    },
  };
}

describe('InternalOrderService', () => {
  describe('create', () => {
    // Owner 2026-07-08: «Проведено» has NO position precondition — an EMPTY
    // document may be saved (0 positions ⇒ 0 sum). The old rejects-on-empty
    // expectation only "passed" via an unrelated mock TypeError (findMany
    // returned undefined inside the numbering seed) — fixed alongside the mock.
    it('creates an empty document (0 positions ⇒ 0 sum)', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        positions: [],
      });
      expect(state.rows[0]?.sumMinor).toBe(0n);
      expect(state.rows[0]?.state).toBe('draft');
    });

    it('computes sum from positions (price × quantity)', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        positions: [
          {
            assortmentKind: 'product',
            assortmentId: '00000000-0000-0000-0000-000000000100',
            quantity: '2',
            priceMinor: '500000', // 2 × 500_000 = 1_000_000
            vat: 12,
            vatEnabled: true,
          },
          {
            assortmentKind: 'product',
            assortmentId: '00000000-0000-0000-0000-000000000101',
            quantity: '5',
            priceMinor: '200000', // 5 × 200_000 = 1_000_000
            vatEnabled: true,
          },
        ],
      });
      const row = state.rows[0];
      expect(row).toBeDefined();
      expect(row?.sumMinor).toBe(2_000_000n);
      // VAT applied only to first line (vat=12 → 1_000_000 × 12 / 100 = 120_000)
      expect(row?.vatSumMinor).toBe(120_000n);
    });

    it('creates row with draft state when applicable=false', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        positions: [
          {
            assortmentKind: 'product',
            assortmentId: '00000000-0000-0000-0000-000000000100',
            quantity: '1',
            priceMinor: '1',
            vatEnabled: true,
          },
        ],
      });
      expect(state.rows[0]?.state).toBe('draft');
      expect(state.rows[0]?.applicable).toBe(false);
    });

    it('creates row with posted state when applicable=true', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        applicable: true,
        positions: [
          {
            assortmentKind: 'product',
            assortmentId: '00000000-0000-0000-0000-000000000100',
            quantity: '1',
            priceMinor: '1',
            vatEnabled: true,
          },
        ],
      });
      expect(state.rows[0]?.state).toBe('posted');
      expect(state.rows[0]?.applicable).toBe(true);
    });
  });

  describe('transition', () => {
    it('post flips state to posted', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.transition('acc-1', 'user-1', 'io-1', 'post');
      expect(draft.state).toBe('posted');
      expect(draft.applicable).toBe(true);
    });

    it('post rejects already-posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await expect(svc.transition('acc-1', 'user-1', 'io-1', 'post')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('unpost from posted flips back to draft', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.transition('acc-1', 'user-1', 'io-1', 'unpost');
      expect(posted.state).toBe('draft');
      expect(posted.applicable).toBe(false);
    });

    it('cancel from any state moves to cancelled', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.transition('acc-1', 'user-1', 'io-1', 'cancel');
      expect(draft.state).toBe('cancelled');
    });
  });

  describe('update', () => {
    it('rejects edits on posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      // version: 1 so the payload passes UpdateInternalOrderSchema (optimistic-lock
      // token) and the rejection comes from the posted-doc guard, not a parse error.
      await expect(
        svc.update('acc-1', 'user-1', 'io-1', { version: 1, description: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('rejects deletion of posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await expect(svc.softDelete('acc-1', 'user-1', 'io-1')).rejects.toThrow(BadRequestException);
    });

    it('allows soft delete of draft', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new InternalOrderService({ client: prisma.client } as never);
      await svc.softDelete('acc-1', 'user-1', 'io-1');
      expect(draft.deletedAt).toBeInstanceOf(Date);
      expect(draft.state).toBe('cancelled');
    });
  });
});
