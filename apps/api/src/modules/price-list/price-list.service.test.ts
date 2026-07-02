import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PriceListService } from './price-list.service.js';

interface Row {
  id: string;
  name: string;
  accountId: string;
  organizationId: string;
  priceTypeId: string | null;
  applicable: boolean;
  state: string;
  pricesJson: Record<string, Record<string, string>>;
  currency: string;
  rateValue: bigint;
  description: string | null;
  code: string | null;
  externalCode: string | null;
  deletedAt: Date | null;
}

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'pl-1',
    name: 'Sales prices 2026-Q2',
    accountId: 'acc-1',
    organizationId: '00000000-0000-0000-0000-000000000010',
    priceTypeId: null,
    applicable: false,
    state: 'draft',
    pricesJson: {},
    currency: 'UZS',
    rateValue: 100_000_000n,
    description: null,
    code: null,
    externalCode: null,
    deletedAt: null,
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
  return {
    client: {
      priceList: { findFirst, create, update, count: vi.fn(), findMany: vi.fn() },
      auditLog: { create: vi.fn() },
      employee: { findUnique: vi.fn(async () => null) },
    },
  };
}

describe('PriceListService', () => {
  describe('create', () => {
    it('persists pricesJson snapshot', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      const snap = {
        '00000000-0000-0000-0000-000000000100': {
          '00000000-0000-0000-0000-000000000200': '1500000000',
          '00000000-0000-0000-0000-000000000201': '1200000000',
        },
      };
      await svc.create('acc-1', 'emp-1', {
        name: 'Test prices',
        organizationId: '00000000-0000-0000-0000-000000000010',
        pricesJson: snap,
      });
      expect(state.rows[0]?.pricesJson).toEqual(snap);
    });

    it('post-on-create sets state=posted', async () => {
      const state = { rows: [] as Row[] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      await svc.create('acc-1', 'emp-1', {
        name: 'Already published',
        organizationId: '00000000-0000-0000-0000-000000000010',
        applicable: true,
      });
      expect(state.rows[0]?.state).toBe('posted');
    });
  });

  describe('update', () => {
    it('rejects edits on posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      await expect(
        svc.update('acc-1', 'user-1', 'pl-1', { version: 1, description: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows pricesJson edit on draft', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      const snap = {
        '00000000-0000-0000-0000-000000000100': {
          '00000000-0000-0000-0000-000000000200': '999000000',
        },
      };
      await svc.update('acc-1', 'user-1', 'pl-1', { version: 1, pricesJson: snap });
      expect(draft.pricesJson).toEqual(snap);
    });
  });

  describe('transition', () => {
    it('post flips to posted', async () => {
      const draft = makeRow();
      const state = { rows: [draft] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      await svc.transition('acc-1', 'user-1', 'pl-1', 'post');
      expect(draft.state).toBe('posted');
      expect(draft.applicable).toBe(true);
    });

    it('unpost from posted flips to draft (allow editing again)', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      await svc.transition('acc-1', 'user-1', 'pl-1', 'unpost');
      expect(posted.state).toBe('draft');
      expect(posted.applicable).toBe(false);
    });

    it('post rejects when already posted', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      await expect(svc.transition('acc-1', 'user-1', 'pl-1', 'post')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cancel moves to cancelled', async () => {
      const posted = makeRow({ applicable: true, state: 'posted' });
      const state = { rows: [posted] };
      const prisma = makePrismaMock(state);
      const svc = new PriceListService({ client: prisma.client } as never);
      await svc.transition('acc-1', 'user-1', 'pl-1', 'cancel');
      expect(posted.state).toBe('cancelled');
    });
  });
});
