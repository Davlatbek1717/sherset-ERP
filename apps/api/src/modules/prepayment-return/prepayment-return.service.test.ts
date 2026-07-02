import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import type { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { UpdatePrepaymentReturnSchema } from './prepayment-return.schema.js';
import { PrepaymentReturnService } from './prepayment-return.service.js';

/**
 * Service tests cover:
 *   - Sign convention (post → +sumMinor, opposite of Prepayment)
 *   - The cap rule (sum of applicable returns ≤ source.sumMinor)
 *   - Lock on edit/transition when applicable
 */

interface Row {
  id: string;
  name: string;
  agentId: string;
  organizationId: string;
  prepaymentId: string;
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

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'prr-1',
    name: 'PRR-2026-00001',
    agentId: 'cp-1',
    organizationId: 'org-1',
    prepaymentId: '00000000-0000-0000-0000-000000000099',
    retailShiftId: null,
    retailStoreId: null,
    sumMinor: 300_000n,
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
    moment: new Date('2026-05-12'),
    applicable: false,
    state: 'draft',
    postedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makePrismaMock(state: {
  returns: Row[];
  prepayment: {
    id: string;
    name: string;
    sumMinor: bigint;
    currency: string;
    agentId: string;
    organizationId: string;
    deletedAt: Date | null;
  };
  aggregateSum: bigint;
}) {
  const findFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where ?? {};
    return (
      state.returns.find((r) => {
        if (w.id && r.id !== w.id) return false;
        if (w.deletedAt === null && r.deletedAt !== null) return false;
        return true;
      }) ?? null
    );
  });
  const prepaymentFindFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    if (state.prepayment.id !== args.where.id) return null;
    if (state.prepayment.deletedAt !== null) return null;
    return state.prepayment;
  });
  const prepaymentReturnAggregate = vi.fn(async () => ({
    _sum: { sumMinor: state.aggregateSum },
  }));
  const create = vi.fn(async (args: { data: Partial<Row> }) => {
    const row = makeRow(args.data);
    state.returns.push(row);
    return row;
  });
  const update = vi.fn(async (args: { where: { id: string }; data: Partial<Row> }) => {
    const row = state.returns.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });

  const prepaymentReturn = {
    findFirst,
    findUnique: findFirst,
    create,
    update,
    count: vi.fn(),
    findMany: vi.fn(),
    aggregate: prepaymentReturnAggregate,
  };
  const prepayment = { findFirst: prepaymentFindFirst };
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
        prepaymentReturn: typeof prepaymentReturn;
        prepayment: typeof prepayment;
        auditLog: typeof auditLog;
      }) => Promise<unknown>,
    ) => fn({ prepaymentReturn, prepayment, auditLog }),
  );
  return {
    client: {
      prepaymentReturn,
      prepayment,
      auditLog,
      $transaction,
      documentSequence: mockDocumentSequence(),
      // H4 P1 create-stamp: mock returns no employee → groupId resolves null.
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

describe('PrepaymentReturnService', () => {
  const sourcePrepayment = {
    id: '00000000-0000-0000-0000-000000000099',
    name: 'PR-2026-00001',
    sumMinor: 1_000_000n,
    currency: 'UZS',
    agentId: 'cp-1',
    organizationId: 'org-1',
    deletedAt: null,
  };

  describe('create', () => {
    it('draft create skips balance + cap check', async () => {
      const state = { returns: [] as Row[], prepayment: sourcePrepayment, aggregateSum: 0n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        prepaymentId: '00000000-0000-0000-0000-000000000099',
        sumMinor: '500000',
      });
      expect(balances.spy).not.toHaveBeenCalled();
    });

    it('post-on-create nudges balance by +sumMinor (refund)', async () => {
      const state = { returns: [] as Row[], prepayment: sourcePrepayment, aggregateSum: 0n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        prepaymentId: '00000000-0000-0000-0000-000000000099',
        sumMinor: '300000',
        applicable: true,
      });
      expect(balances.spy.mock.calls[0]?.[4]).toBe(300_000n);
    });

    it('rejects when source prepayment is missing', async () => {
      const state = {
        returns: [] as Row[],
        prepayment: { ...sourcePrepayment, id: '00000000-0000-0000-0000-000000000088' },
        aggregateSum: 0n,
      };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await expect(
        svc.create('acc-1', 'emp-1', {
          prepaymentId: '00000000-0000-0000-0000-000000000099',
          sumMinor: '100000',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks post-on-create when running total + new sum overshoots source cap', async () => {
      // Source prepayment is 1M, already returned 800k → only 200k remaining,
      // try to return 300k more → should reject.
      const state = { returns: [] as Row[], prepayment: sourcePrepayment, aggregateSum: 800_000n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await expect(
        svc.create('acc-1', 'emp-1', {
          prepaymentId: '00000000-0000-0000-0000-000000000099',
          sumMinor: '300000',
          applicable: true,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(balances.spy).not.toHaveBeenCalled();
    });
  });

  describe('transition', () => {
    it('post applies +sumMinor and flips state', async () => {
      const draft = makeRow();
      const state = { returns: [draft], prepayment: sourcePrepayment, aggregateSum: 0n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'prr-1', 'post');
      expect(balances.spy.mock.calls[0]?.[4]).toBe(300_000n);
      expect(draft.state).toBe('posted');
    });

    it('post rejects when cap exceeded (excluding self)', async () => {
      const draft = makeRow({ sumMinor: 400_000n });
      // Source 1M, already 700k posted (NOT counting this draft), this draft posts 400k → 1.1M total → reject.
      const state = {
        returns: [draft],
        prepayment: sourcePrepayment,
        aggregateSum: 700_000n,
      };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await expect(svc.transition('acc-1', 'emp-1', 'prr-1', 'post')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('unpost reverses with -sumMinor', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { returns: [posted], prepayment: sourcePrepayment, aggregateSum: 300_000n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'prr-1', 'unpost');
      expect(balances.spy.mock.calls[0]?.[4]).toBe(-300_000n);
      expect(posted.state).toBe('draft');
    });

    it('cancel from posted reverses', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { returns: [posted], prepayment: sourcePrepayment, aggregateSum: 300_000n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'prr-1', 'cancel');
      expect(balances.spy.mock.calls[0]?.[4]).toBe(-300_000n);
      expect(posted.state).toBe('cancelled');
    });
  });

  describe('update', () => {
    it('rejects edits on posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { returns: [posted], prepayment: sourcePrepayment, aggregateSum: 300_000n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await expect(
        svc.update('acc-1', 'emp-1', 'prr-1', { description: 'x', version: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // History/«Tarix» parity: the service used to write ZERO auditLog rows, so
  // /audit-logs?entity=PrepaymentReturn always returned empty. These lock the
  // writes + the exact entity string the web page queries (auditEntity="PrepaymentReturn").
  describe('audit-log (History tab parity)', () => {
    it('create writes an audit row with entity=PrepaymentReturn action=create', async () => {
      const state = { returns: [] as Row[], prepayment: sourcePrepayment, aggregateSum: 0n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        prepaymentId: '00000000-0000-0000-0000-000000000099',
        sumMinor: '300000',
      });
      expect(prisma.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'acc-1',
            userId: 'emp-1',
            entity: 'PrepaymentReturn',
            action: 'create',
          }),
        }),
      );
    });

    it('transition post writes transition:posted with money-safe string amount', async () => {
      const draft = makeRow();
      const state = { returns: [draft], prepayment: sourcePrepayment, aggregateSum: 0n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.transition('acc-1', 'emp-1', 'prr-1', 'post');
      const call = prisma.auditCreate.mock.calls.find(
        (c) => (c[0] as { data: { action: string } }).data.action === 'transition:posted',
      );
      expect(call).toBeDefined();
      const data = (call?.[0] as { data: Record<string, unknown> }).data;
      expect(data.entity).toBe('PrepaymentReturn');
      expect((data.fieldChanges as { amount: string }).amount).toBe('300000');
    });

    it('softDelete writes an audit row with action=delete', async () => {
      const draft = makeRow();
      const state = { returns: [draft], prepayment: sourcePrepayment, aggregateSum: 0n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.softDelete('acc-1', 'emp-1', 'prr-1');
      expect(prisma.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'PrepaymentReturn',
            action: 'delete',
            userId: 'emp-1',
          }),
        }),
      );
    });
  });

  describe('currency lock (2026-06-03g audit)', () => {
    it('forces the refund currency to the source advance currency, ignoring the client value', async () => {
      // A refund booked in a different currency would bypass the (currency-blind)
      // over-return cap while crediting a different balance bucket → over-refund.
      const usdSource = { ...sourcePrepayment, currency: 'USD' };
      const state = { returns: [] as Row[], prepayment: usdSource, aggregateSum: 0n };
      const prisma = makePrismaMock(state);
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client: prisma.client } as never, balances.service);
      await svc.create('acc-1', 'emp-1', {
        prepaymentId: '00000000-0000-0000-0000-000000000099',
        sumMinor: '100000',
        currency: 'UZS', // client tries a mismatched currency
      });
      const createSpy = prisma.client.prepaymentReturn.create as unknown as {
        mock: { calls: Array<[{ data: { currency: string } }]> };
      };
      expect(createSpy.mock.calls[0][0].data.currency).toBe('USD');
    });
  });

  describe('findById — remaining to return (2026-06-03g audit)', () => {
    it('nets the source sum by other applicable returns and excludes the current row', async () => {
      const row = {
        id: 'prr-1',
        prepaymentId: 'pp-1',
        prepayment: { id: 'pp-1', name: 'PR-1', sumMinor: 1_000_000n, state: 'posted' },
      };
      const aggregate = vi.fn(async () => ({ _sum: { sumMinor: 300_000n } }));
      const client = {
        prepaymentReturn: { findFirst: vi.fn(async () => row), aggregate },
      };
      const balances = makeBalances();
      const svc = new PrepaymentReturnService({ client } as never, balances.service);
      const res = (await svc.findById('acc-1', 'prr-1')) as { prepaymentRemainingMinor: bigint };
      expect(res.prepaymentRemainingMinor).toBe(700_000n);
      const aggArg = aggregate.mock.calls[0]?.[0] as unknown as { where: { NOT?: { id: string } } };
      expect(aggArg.where.NOT).toEqual({ id: 'prr-1' });
    });
  });
});

describe('UpdatePrepaymentReturnSchema — currency + null-split contract (2026-06-03g)', () => {
  it('rejects a currency change on update (a refund stays in the source currency)', () => {
    // version added so this isolates the currency rejection (not a missing-version reject)
    expect(UpdatePrepaymentReturnSchema.safeParse({ currency: 'USD', version: 1 }).success).toBe(
      false,
    );
  });

  it('still accepts a normal field update', () => {
    expect(UpdatePrepaymentReturnSchema.safeParse({ description: 'x', version: 1 }).success).toBe(
      true,
    );
  });

  it('rejects null retail-split fields (FE must send "0", not null)', () => {
    expect(UpdatePrepaymentReturnSchema.safeParse({ cashSumMinor: null, version: 1 }).success).toBe(
      false,
    );
    expect(
      UpdatePrepaymentReturnSchema.safeParse({ noCashSumMinor: null, version: 1 }).success,
    ).toBe(false);
    expect(UpdatePrepaymentReturnSchema.safeParse({ qrSumMinor: null, version: 1 }).success).toBe(
      false,
    );
  });

  it('accepts the post-fix non-retail payload (splits as "0")', () => {
    const r = UpdatePrepaymentReturnSchema.safeParse({
      sumMinor: '500000',
      cashSumMinor: '0',
      noCashSumMinor: '0',
      qrSumMinor: '0',
      version: 1,
    });
    expect(r.success).toBe(true);
  });
});
