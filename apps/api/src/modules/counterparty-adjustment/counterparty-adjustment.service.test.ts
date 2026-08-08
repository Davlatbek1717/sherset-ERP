import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import type { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { CounterpartyAdjustmentService } from './counterparty-adjustment.service.js';

/**
 * Service-level tests focus on the sign convention and the lifecycle
 * around `applicable`. Database mock surfaces just enough Prisma surface
 * to exercise `create` / `transition` / `update` paths without touching
 * Postgres.
 */

interface AdjustmentRow {
  id: string;
  agentId: string;
  organizationId: string;
  direction: 'INCREASE' | 'DECREASE';
  sumMinor: bigint;
  currency: string;
  applicable: boolean;
  state: string;
  rateValue: bigint;
  description: string | null;
  externalCode: string | null;
  moment: Date;
  postedAt: Date | null;
  name: string;
  deletedAt: Date | null;
}

function makeAdj(overrides: Partial<AdjustmentRow> = {}): AdjustmentRow {
  return {
    id: 'adj-1',
    agentId: 'cp-1',
    organizationId: 'org-1',
    direction: 'INCREASE',
    sumMinor: 1_000_000n,
    currency: 'UZS',
    applicable: false,
    state: 'draft',
    rateValue: 100_000_000n,
    description: null,
    externalCode: null,
    moment: new Date('2026-04-01'),
    postedAt: null,
    name: 'KV-2026-00001',
    deletedAt: null,
    ...overrides,
  };
}

function makePrismaMock(state: { rows: AdjustmentRow[] }) {
  const findFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where ?? {};
    return (
      state.rows.find((r) => {
        if (where.id && r.id !== where.id) return false;
        if (where.deletedAt === null && r.deletedAt !== null) return false;
        return true;
      }) ?? null
    );
  });
  const create = vi.fn(async (args: { data: Partial<AdjustmentRow> }) => {
    const row = makeAdj(args.data as Partial<AdjustmentRow>);
    state.rows.push(row);
    return row;
  });
  const update = vi.fn(async (args: { where: { id: string }; data: Partial<AdjustmentRow> }) => {
    const row = state.rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });
  const count = vi.fn(async () => state.rows.length);
  const findMany = vi.fn(async () => state.rows);
  // Faza 1 (M-01/DUP-01): transitions now open with an atomic state claim —
  // a conditional `updateMany` whose WHERE carries id + accountId + state.
  // The double must honour that WHERE or every transition loses its claim.
  const updateMany = vi.fn(
    async (args: { where: Record<string, unknown>; data: Partial<AdjustmentRow> }) => {
      const w = args.where;
      const row = state.rows.find((r) => r.id === w.id);
      if (!row) return { count: 0 };
      const st = w.state as { in?: string[] } | string | undefined;
      if (st !== undefined) {
        const allowed = typeof st === 'string' ? [st] : (st.in ?? []);
        if (!allowed.includes(row.state)) return { count: 0 };
      }
      Object.assign(row, args.data);
      return { count: 1 };
    },
  );

  const counterpartyAdjustment = {
    findFirst,
    findUnique: findFirst,
    create,
    update,
    updateMany,
    count,
    findMany,
  };
  // Audit-log write parity (History/«Tarix» tab): create/update/delete/
  // transition now write an auditLog row. The mock must expose it on both the
  // plain client (non-tx logAudit) and the tx object (inline transition write).
  const auditCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'audit-1',
    ...args.data,
  }));
  const auditLog = { create: auditCreate };
  const $transaction = vi.fn(
    async (
      fn: (tx: {
        counterpartyAdjustment: typeof counterpartyAdjustment;
        auditLog: typeof auditLog;
      }) => Promise<unknown>,
    ) => fn({ counterpartyAdjustment, auditLog }),
  );

  return {
    client: {
      counterpartyAdjustment,
      auditLog,
      $transaction,
      documentSequence: mockDocumentSequence(),
      // H4 P1 create-stamp: mock returns no employee → groupId resolves null.
      employee: { findUnique: vi.fn(async () => null) },
    },
    spies: { findFirst, create, update, count, findMany, $transaction, auditCreate },
  };
}

function makeBalances() {
  const applyDelta = vi.fn(async () => undefined);
  return {
    service: { applyDelta } as unknown as CounterpartyBalanceService,
    spy: applyDelta,
  };
}

describe('CounterpartyAdjustmentService', () => {
  describe('create', () => {
    it('writes a draft without touching balance when applicable=false', async () => {
      const state = { rows: [] as AdjustmentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        direction: 'INCREASE',
        sumMinor: '1000000',
      });
      expect(balances.spy).not.toHaveBeenCalled();
    });

    it('INCREASE direction nudges balance with positive delta on post-on-create', async () => {
      const state = { rows: [] as AdjustmentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        direction: 'INCREASE',
        sumMinor: '5000000',
        applicable: true,
      });
      expect(balances.spy).toHaveBeenCalledTimes(1);
      // 4th arg = currency, 5th arg = signed delta
      expect(balances.spy.mock.calls[0]?.[4]).toBe(5_000_000n);
    });

    it('DECREASE direction nudges balance with negative delta on post-on-create', async () => {
      const state = { rows: [] as AdjustmentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        direction: 'DECREASE',
        sumMinor: '5000000',
        applicable: true,
      });
      expect(balances.spy.mock.calls[0]?.[4]).toBe(-5_000_000n);
    });
  });

  describe('transition', () => {
    it('post → applies +delta and flips state to posted', async () => {
      const draft = makeAdj({ applicable: false, state: 'draft' });
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.transition('acc-1', 'emp-1', 'adj-1', 'post');
      expect(balances.spy).toHaveBeenCalledTimes(1);
      expect(balances.spy.mock.calls[0]?.[4]).toBe(1_000_000n);
      expect(draft.applicable).toBe(true);
      expect(draft.state).toBe('posted');
    });

    it('post rejects when already posted (idempotency guard)', async () => {
      const posted = makeAdj({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await expect(svc.transition('acc-1', 'emp-1', 'adj-1', 'post')).rejects.toThrow(
        BadRequestException,
      );
      expect(balances.spy).not.toHaveBeenCalled();
    });

    it('unpost reverses the delta and flips state back to draft', async () => {
      const posted = makeAdj({ applicable: true, state: 'posted', direction: 'INCREASE' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.transition('acc-1', 'emp-1', 'adj-1', 'unpost');
      expect(balances.spy.mock.calls[0]?.[4]).toBe(-1_000_000n);
      expect(posted.applicable).toBe(false);
      expect(posted.state).toBe('draft');
    });

    it('cancel from posted reverses delta and stamps cancelled', async () => {
      const posted = makeAdj({ applicable: true, state: 'posted', direction: 'DECREASE' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.transition('acc-1', 'emp-1', 'adj-1', 'cancel');
      // DECREASE was -1M; reversing means +1M
      expect(balances.spy.mock.calls[0]?.[4]).toBe(1_000_000n);
      expect(posted.state).toBe('cancelled');
      expect(posted.applicable).toBe(false);
    });

    it('cancel from draft skips balance call (nothing was applied)', async () => {
      const draft = makeAdj({ applicable: false, state: 'draft' });
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.transition('acc-1', 'emp-1', 'adj-1', 'cancel');
      expect(balances.spy).not.toHaveBeenCalled();
      expect(draft.state).toBe('cancelled');
    });
  });

  describe('update', () => {
    it('rejects edits to posted documents', async () => {
      const posted = makeAdj({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await expect(
        svc.update('acc-1', 'emp-1', 'adj-1', { description: 'should fail', version: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows description edit on a draft', async () => {
      const draft = makeAdj({ applicable: false, state: 'draft', description: null });
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.update('acc-1', 'emp-1', 'adj-1', {
        description: 'rounding write-off',
        version: 1,
      });
      expect(draft.description).toBe('rounding write-off');
    });
  });

  // History/«Tarix» parity: the service used to write ZERO auditLog rows, so
  // /audit-logs?entity=CounterpartyAdjustment always returned empty. These lock
  // the writes + the exact entity string the web page queries
  // (auditEntity="CounterpartyAdjustment").
  describe('audit-log (History tab parity)', () => {
    it('create writes an audit row with entity=CounterpartyAdjustment action=create', async () => {
      const state = { rows: [] as AdjustmentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        direction: 'INCREASE',
        sumMinor: '1000000',
      });
      expect(prisma.spies.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'acc-1',
            userId: 'emp-1',
            entity: 'CounterpartyAdjustment',
            action: 'create',
          }),
        }),
      );
    });

    it('transition post writes transition:posted with direction + money-safe string amount', async () => {
      const draft = makeAdj({ applicable: false, state: 'draft' });
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.transition('acc-1', 'emp-1', 'adj-1', 'post');
      const call = prisma.spies.auditCreate.mock.calls.find(
        (c) => (c[0] as { data: { action: string } }).data.action === 'transition:posted',
      );
      expect(call).toBeDefined();
      const data = (call?.[0] as { data: Record<string, unknown> }).data;
      expect(data.entity).toBe('CounterpartyAdjustment');
      const fc = data.fieldChanges as { amount: string; direction: string };
      expect(fc.amount).toBe('1000000');
      expect(fc.direction).toBe('INCREASE');
    });

    it('softDelete writes an audit row with action=delete', async () => {
      const draft = makeAdj({ applicable: false, state: 'draft' });
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new CounterpartyAdjustmentService(
        { client: prisma.client } as never,
        balances.service,
      );
      await svc.softDelete('acc-1', 'emp-1', 'adj-1');
      expect(prisma.spies.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'CounterpartyAdjustment',
            action: 'delete',
            userId: 'emp-1',
          }),
        }),
      );
    });
  });
});
