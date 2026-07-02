import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { ProcessingOrderService } from './processing-order.service.js';

// =========================================================================
// Test helpers
// =========================================================================

interface Row {
  id: string;
  name: string;
  accountId: string;
  organizationId: string;
  storeId: string;
  processingPlanId: string | null;
  productionId: string | null;
  ownerId: string | null;
  applicable: boolean;
  state: string;
  quantity: bigint;
  sumMinor: bigint;
  description: string | null;
  externalCode: string | null;
  deletedAt: Date | null;
  postedAt: Date | null;
}

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'po-1',
    name: 'PO-2026-00001',
    accountId: 'acc-1',
    organizationId: '00000000-0000-0000-0000-000000000010',
    storeId: '00000000-0000-0000-0000-000000000020',
    processingPlanId: null,
    productionId: null,
    ownerId: null,
    applicable: false,
    state: 'draft',
    quantity: 1_000n, // 1 unit in microqty
    sumMinor: 0n,
    description: null,
    externalCode: null,
    deletedAt: null,
    postedAt: null,
    ...overrides,
  };
}

interface BomRow {
  id: string;
  standardCostMinor: bigint;
}

function makePrismaMock(state: { rows: Row[]; boms?: BomRow[] }) {
  const bomRows: BomRow[] = state.boms ?? [];

  const processingOrderFindFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
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

  const processingOrder = {
    findFirst: processingOrderFindFirst,
    findUnique: processingOrderFindFirst,
    create,
    update,
    count: vi.fn(async () => state.rows.length),
    findMany: vi.fn(async () => state.rows),
  };

  const billOfMaterials = {
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      return bomRows.find((b) => b.id === args.where.id) ?? null;
    }),
  };

  const auditLog = {
    create: vi.fn(async () => ({})),
  };

  return {
    client: {
      processingOrder,
      billOfMaterials,
      auditLog,
      documentSequence: mockDocumentSequence(),
      employee: { findUnique: vi.fn(async () => null) },
    },
  };
}

// =========================================================================
// Tests
// =========================================================================

describe('ProcessingOrderService', () => {
  // -------------------------------------------------------------------------
  describe('create', () => {
    it('creates row with draft state when applicable=false (default)', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        quantity: '5',
      });

      expect(state.rows[0]?.state).toBe('draft');
      expect(state.rows[0]?.applicable).toBe(false);
    });

    it('creates row in posted state when applicable=true', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        quantity: '3',
        applicable: true,
      });

      expect(state.rows[0]?.state).toBe('posted');
      expect(state.rows[0]?.applicable).toBe(true);
    });

    it('stores quantity as ×1000 microqty BigInt', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        quantity: '7',
      });

      // 7 whole units → 7000 microqty
      expect(state.rows[0]?.quantity).toBe(7_000n);
    });

    it('computes sumMinor from BOM standardCostMinor × quantity when processingPlanId set', async () => {
      const bomId = '00000000-0000-0000-0000-000000000099';
      const state = {
        rows: [] as Row[],
        boms: [{ id: bomId, standardCostMinor: 500_000n }], // 500 som per unit
      };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        processingPlanId: bomId,
        quantity: '10',
      });

      // sumMinor = 500_000 × 10 = 5_000_000
      expect(state.rows[0]?.sumMinor).toBe(5_000_000n);
    });

    it('sets sumMinor=0 when no processingPlanId given', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        quantity: '3',
      });

      expect(state.rows[0]?.sumMinor).toBe(0n);
    });

    it('auto-numbers PO-YYYY-NNNNN (increments from existing)', async () => {
      const existing = makeRow({ name: 'PO-2026-00005' });
      const state = { rows: [existing] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.create('acc-1', 'emp-1', {
        organizationId: '00000000-0000-0000-0000-000000000010',
        storeId: '00000000-0000-0000-0000-000000000020',
        quantity: '1',
      });

      const newRow = state.rows[state.rows.length - 1];
      expect(newRow?.name).toMatch(/^PO-\d{4}-00006$/);
    });
  });

  // -------------------------------------------------------------------------
  describe('transition', () => {
    it('post flips state to posted + applicable=true', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.transition('acc-1', 'user-1', 'po-1', 'post');

      expect(draft.state).toBe('posted');
      expect(draft.applicable).toBe(true);
    });

    it('post rejects already-posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await expect(svc.transition('acc-1', 'user-1', 'po-1', 'post')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('unpost from posted flips back to draft', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.transition('acc-1', 'user-1', 'po-1', 'unpost');

      expect(posted.state).toBe('draft');
      expect(posted.applicable).toBe(false);
    });

    it('cancel transitions from any state to cancelled', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.transition('acc-1', 'user-1', 'po-1', 'cancel');

      expect(draft.state).toBe('cancelled');
    });
  });

  // -------------------------------------------------------------------------
  describe('update', () => {
    it('rejects edits on a posted document', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      // version: 1 so the payload passes the schema (optimistic-lock token) and the
      // rejection comes from the posted-doc guard, not a parse error.
      await expect(
        svc.update('acc-1', 'user-1', 'po-1', { version: 1, description: 'change' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  describe('softDelete', () => {
    it('rejects deletion of posted document', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await expect(svc.softDelete('acc-1', 'user-1', 'po-1')).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes a draft document', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      const result = await svc.softDelete('acc-1', 'user-1', 'po-1');

      expect(result).toEqual({ ok: true });
      expect(draft.deletedAt).toBeInstanceOf(Date);
      expect(draft.state).toBe('cancelled');
    });
  });

  // -------------------------------------------------------------------------
  describe('clone', () => {
    it('carries over processingPlanId and quantity from source', async () => {
      const bomId = '00000000-0000-0000-0000-000000000099';
      const src = makeRow({
        processingPlanId: bomId,
        quantity: 5_000n, // 5 units
      });
      const state = {
        rows: [src],
        boms: [{ id: bomId, standardCostMinor: 200_000n }],
      };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.clone('acc-1', 'emp-1', 'po-1');

      const cloned = state.rows[state.rows.length - 1];
      expect(cloned?.processingPlanId).toBe(bomId);
      // 5 units → 5000 microqty
      expect(cloned?.quantity).toBe(5_000n);
      // sumMinor = 200_000 × 5 = 1_000_000
      expect(cloned?.sumMinor).toBe(1_000_000n);
    });

    it('clone always starts in draft state', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new ProcessingOrderService({ client: prisma.client } as never);

      await svc.clone('acc-1', 'emp-1', 'po-1');

      const cloned = state.rows[state.rows.length - 1];
      expect(cloned?.state).toBe('draft');
      expect(cloned?.applicable).toBe(false);
    });
  });
});
