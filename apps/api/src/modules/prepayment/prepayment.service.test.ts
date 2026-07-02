import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import type { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { PrepaymentService } from './prepayment.service.js';

/**
 * Service tests focus on sign convention (PaymentIn-style: post → -delta)
 * and the retail-split validator (cash+noCash+qr must == sum when any of
 * them is non-zero).
 */

interface PrepaymentRow {
  id: string;
  name: string;
  agentId: string;
  organizationId: string;
  customerOrderId: string | null;
  retailShiftId: string | null;
  retailStoreId: string | null;
  sumMinor: bigint;
  vatSumMinor: bigint;
  cashSumMinor: bigint;
  noCashSumMinor: bigint;
  qrSumMinor: bigint;
  vatEnabled: boolean;
  vatIncluded: boolean;
  taxSystem: string | null;
  currency: string;
  rateValue: bigint;
  description: string | null;
  externalCode: string | null;
  moment: Date;
  applicable: boolean;
  state: string;
  postedAt: Date | null;
  deletedAt: Date | null;
}

function makeRow(overrides: Partial<PrepaymentRow> = {}): PrepaymentRow {
  return {
    id: 'pr-1',
    name: 'PR-2026-00001',
    agentId: 'cp-1',
    organizationId: 'org-1',
    customerOrderId: null,
    retailShiftId: null,
    retailStoreId: null,
    sumMinor: 1_000_000n,
    vatSumMinor: 0n,
    cashSumMinor: 0n,
    noCashSumMinor: 0n,
    qrSumMinor: 0n,
    vatEnabled: true,
    vatIncluded: false,
    taxSystem: null,
    currency: 'UZS',
    rateValue: 100_000_000n,
    description: null,
    externalCode: null,
    moment: new Date('2026-05-01'),
    applicable: false,
    state: 'draft',
    postedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makePrismaMock(state: { rows: PrepaymentRow[] }) {
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
  const create = vi.fn(async (args: { data: Partial<PrepaymentRow> }) => {
    const row = makeRow(args.data);
    state.rows.push(row);
    return row;
  });
  const update = vi.fn(async (args: { where: { id: string }; data: Partial<PrepaymentRow> }) => {
    const row = state.rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });
  const prepayment = {
    findFirst,
    findUnique: findFirst,
    create,
    update,
    count: vi.fn(),
    findMany: vi.fn(),
  };
  // Audit-log write parity (History/«Tarix» tab): create/update/delete/
  // transition now write an auditLog row. The mock must expose it on both the
  // plain client (non-tx logAudit) and the tx object (inline transition write),
  // else every mutating path throws `auditLog is undefined`.
  const auditCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'audit-1',
    ...args.data,
  }));
  const auditLog = { create: auditCreate };
  const $transaction = vi.fn(
    async (
      fn: (tx: { prepayment: typeof prepayment; auditLog: typeof auditLog }) => Promise<unknown>,
    ) => fn({ prepayment, auditLog }),
  );
  return {
    client: {
      prepayment,
      auditLog,
      $transaction,
      documentSequence: mockDocumentSequence(),
      // H4 P1 create-stamp resolves the creator's group; mock returns no
      // employee → groupId resolves null (create proceeds, unaffected).
      employee: { findUnique: vi.fn(async () => null) },
    },
    auditCreate,
  };
}

function makeBalances() {
  const applyDelta = vi.fn(async () => undefined);
  return {
    service: { applyDelta } as unknown as CounterpartyBalanceService,
    spy: applyDelta,
  };
}

describe('PrepaymentService', () => {
  describe('create', () => {
    it('draft create does not touch balance', async () => {
      const state = { rows: [] as PrepaymentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        sumMinor: '1000000',
      });
      expect(balances.spy).not.toHaveBeenCalled();
    });

    it('post-on-create nudges balance by -sumMinor (customer paid us)', async () => {
      const state = { rows: [] as PrepaymentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        sumMinor: '500000',
        applicable: true,
      });
      expect(balances.spy.mock.calls[0]?.[4]).toBe(-500_000n);
    });

    it('rejects when retail split (cash+noCash+qr) != sumMinor', async () => {
      const state = { rows: [] as PrepaymentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await expect(
        svc.create('acc-1', 'emp-1', {
          agentId: '00000000-0000-0000-0000-000000000001',
          organizationId: '00000000-0000-0000-0000-000000000002',
          sumMinor: '1000',
          cashSumMinor: '400',
          noCashSumMinor: '400',
          qrSumMinor: '100', // sum = 900, mismatch
        }),
      ).rejects.toThrow();
    });

    it('accepts retail split when total equals sumMinor', async () => {
      const state = { rows: [] as PrepaymentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        sumMinor: '1000',
        cashSumMinor: '600',
        noCashSumMinor: '300',
        qrSumMinor: '100',
      });
      expect(state.rows).toHaveLength(1);
    });
  });

  describe('transition', () => {
    it('post → applies -delta and flips to posted', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'pr-1', 'post');
      expect(balances.spy.mock.calls[0]?.[4]).toBe(-1_000_000n);
      expect(draft.state).toBe('posted');
      expect(draft.applicable).toBe(true);
    });

    it('unpost reverses with +delta and flips to draft', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'pr-1', 'unpost');
      expect(balances.spy.mock.calls[0]?.[4]).toBe(1_000_000n);
      expect(posted.state).toBe('draft');
      expect(posted.applicable).toBe(false);
    });

    it('post rejects when already posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await expect(svc.transition('acc-1', 'emp-1', 'pr-1', 'post')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cancel from posted reverses delta', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'pr-1', 'cancel');
      expect(balances.spy.mock.calls[0]?.[4]).toBe(1_000_000n);
      expect(posted.state).toBe('cancelled');
    });

    it('cancel from draft skips balance reversal', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'pr-1', 'cancel');
      expect(balances.spy).not.toHaveBeenCalled();
      expect(draft.state).toBe('cancelled');
    });
  });

  describe('update', () => {
    it('rejects edits on posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await expect(
        svc.update('acc-1', 'emp-1', 'pr-1', { description: 'x', version: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows description edit on draft', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.update('acc-1', 'emp-1', 'pr-1', { description: 'updated note', version: 1 });
      expect(draft.description).toBe('updated note');
    });
  });

  // History/«Tarix» parity: the service used to write ZERO auditLog rows, so
  // /audit-logs?entity=Prepayment always returned empty. These lock the writes
  // + the exact entity string the web page queries with (auditEntity="Prepayment").
  describe('audit-log (History tab parity)', () => {
    it('create writes an audit row with entity=Prepayment action=create', async () => {
      const state = { rows: [] as PrepaymentRow[] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        agentId: '00000000-0000-0000-0000-000000000001',
        organizationId: '00000000-0000-0000-0000-000000000002',
        sumMinor: '1000000',
      });
      expect(prisma.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'acc-1',
            userId: 'emp-1',
            entity: 'Prepayment',
            action: 'create',
          }),
        }),
      );
    });

    it('transition post writes transition:posted with money-safe string amount', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'pr-1', 'post');
      const call = prisma.auditCreate.mock.calls.find(
        (c) => (c[0] as { data: { action: string } }).data.action === 'transition:posted',
      );
      expect(call).toBeDefined();
      const data = (call?.[0] as { data: Record<string, unknown> }).data;
      expect(data.entity).toBe('Prepayment');
      expect(data.userId).toBe('emp-1');
      // amount must be the BigInt rendered as a string, never Number()
      expect((data.fieldChanges as { amount: string }).amount).toBe('1000000');
    });

    it('softDelete writes an audit row with action=delete', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentService({ client: prisma.client } as never, balances.service);
      await svc.softDelete('acc-1', 'emp-1', 'pr-1');
      expect(prisma.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'Prepayment',
            action: 'delete',
            userId: 'emp-1',
          }),
        }),
      );
    });
  });
});
