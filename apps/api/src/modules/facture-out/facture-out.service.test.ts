import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { FactureOutService } from './facture-out.service.js';

/**
 * Service coverage for the §66 multi-source generation flow (extends
 * Chat-3 §82-84). In-memory Prisma-mock convention — no real DB, no
 * vi.mock. Covers: Chat-3 single-Demand parity (preserved verbatim),
 * multi-Demand aggregation, PurchaseReturn-based, PaymentIn-advance,
 * idempotency and the adversarial guards.
 */

interface DemandRow {
  id: string;
  accountId: string;
  deletedAt: Date | null;
  agentId: string;
  organizationId: string;
  currency: string;
  rateValue: bigint;
  vatEnabled: boolean;
  vatIncluded: boolean;
  sumMinor: bigint;
  vatSumMinor: bigint;
}
interface SourceRow {
  id: string;
  accountId: string;
  deletedAt: Date | null;
  agentId: string;
  organizationId: string;
  currency: string;
  rateValue: bigint;
  vatEnabled: boolean;
  vatIncluded: boolean;
  sumMinor: bigint;
  vatSumMinor: bigint;
}
interface FactureRow {
  id: string;
  accountId: string;
  deletedAt: Date | null;
  name: string;
  demandId: string | null;
  purchaseReturnId: string | null;
  paymentInId: string | null;
  advanceVatRate: number | null;
  agentId: string;
  organizationId: string;
  currency: string;
  rateValue: bigint;
  vatEnabled: boolean;
  vatIncluded: boolean;
  sumMinor: bigint;
  vatSumMinor: bigint;
  state: string;
  ownerId: string | null;
}
interface LinkRow {
  id: string;
  accountId: string;
  factureOutId: string;
  demandId: string;
}

const DEMAND: DemandRow = {
  id: 'dem-1',
  accountId: 'acc-1',
  deletedAt: null,
  agentId: 'agent-1',
  organizationId: 'org-1',
  currency: 'USD',
  rateValue: 1_250_000_000n,
  vatEnabled: true,
  vatIncluded: false,
  sumMinor: 9_999_99n,
  vatSumMinor: 1_666_66n,
};

interface MockState {
  demands: DemandRow[];
  purchaseReturns: SourceRow[];
  paymentsIn: SourceRow[];
  factures: FactureRow[];
  links: LinkRow[];
}

function inList(v: unknown): string[] | null {
  if (v && typeof v === 'object' && 'in' in (v as Record<string, unknown>)) {
    return (v as { in: string[] }).in;
  }
  return null;
}

function makePrismaMock(state: Partial<MockState>) {
  const s: MockState = {
    demands: state.demands ?? [],
    purchaseReturns: state.purchaseReturns ?? [],
    paymentsIn: state.paymentsIn ?? [],
    factures: state.factures ?? [],
    links: state.links ?? [],
  };
  let seq = 0;
  let linkSeq = 0;

  const sourceFinder =
    <T extends { id: string; accountId: string; deletedAt: Date | null }>(rows: T[]) =>
    async (args: { where: Record<string, unknown> }) => {
      const w = args.where ?? {};
      return (
        rows.find((r) => r.id === w.id && r.accountId === w.accountId && r.deletedAt === null) ??
        null
      );
    };

  const demand = {
    findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const w = args.where ?? {};
      const ids = inList(w.id) ?? [];
      return s.demands.filter(
        (d) => ids.includes(d.id) && d.accountId === w.accountId && d.deletedAt === null,
      );
    }),
  };
  const purchaseReturn = { findFirst: vi.fn(sourceFinder(s.purchaseReturns)) };
  const paymentIn = { findFirst: vi.fn(sourceFinder(s.paymentsIn)) };

  const factureOut = {
    findFirst: vi.fn(async (args: { where: Record<string, unknown>; include?: unknown }) => {
      const w = args.where ?? {};
      if (w.name && typeof w.name === 'object') {
        const prefix = (w.name as { startsWith: string }).startsWith;
        const matched = s.factures
          .filter((f) => f.accountId === w.accountId && f.name.startsWith(prefix))
          .sort((a, b) => (a.name < b.name ? 1 : -1));
        return matched[0] ?? null;
      }
      const idIn = inList(w.demandId);
      let row: FactureRow | undefined;
      if (w.id) {
        row = s.factures.find(
          (f) => f.id === w.id && f.accountId === w.accountId && f.deletedAt === null,
        );
      } else if (idIn) {
        row = s.factures.find(
          (f) =>
            f.accountId === w.accountId &&
            f.deletedAt === null &&
            f.demandId != null &&
            idIn.includes(f.demandId),
        );
      } else {
        row = s.factures.find(
          (f) =>
            f.accountId === w.accountId &&
            f.deletedAt === null &&
            (w.demandId === undefined || f.demandId === w.demandId) &&
            (w.purchaseReturnId === undefined || f.purchaseReturnId === w.purchaseReturnId) &&
            (w.paymentInId === undefined || f.paymentInId === w.paymentInId),
        );
      }
      if (!row) return null;
      if (args.include && typeof args.include === 'object' && 'demandLinks' in args.include) {
        return {
          ...row,
          demandLinks: s.links
            .filter((l) => l.factureOutId === row?.id)
            .map((l) => ({ demandId: l.demandId })),
        };
      }
      return row;
    }),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      seq += 1;
      const data = args.data;
      const links = data.demandLinks as { create: Array<{ demandId: string }> } | undefined;
      const row: FactureRow = {
        id: `fo-${seq}`,
        accountId: 'acc-1',
        deletedAt: null,
        name: '',
        demandId: null,
        purchaseReturnId: null,
        paymentInId: null,
        advanceVatRate: null,
        agentId: '',
        organizationId: '',
        currency: 'UZS',
        rateValue: 100_000_000n,
        vatEnabled: true,
        vatIncluded: false,
        sumMinor: 0n,
        vatSumMinor: 0n,
        state: 'draft',
        ownerId: null,
        ...(data as Partial<FactureRow>),
      };
      // demandLinks is a Prisma nested-create object, not a column.
      (row as unknown as Record<string, unknown>).demandLinks = undefined;
      s.factures.push(row);
      for (const l of links?.create ?? []) {
        linkSeq += 1;
        s.links.push({
          id: `fol-${linkSeq}`,
          accountId: 'acc-1',
          factureOutId: row.id,
          demandId: l.demandId,
        });
      }
      return row;
    }),
  };
  const factureOutDemand = {
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const w = args.where ?? {};
      const ids = inList(w.demandId) ?? [];
      const link = s.links.find((l) => l.accountId === w.accountId && ids.includes(l.demandId));
      return link ? { factureOutId: link.factureOutId } : null;
    }),
  };

  return {
    client: {
      demand,
      purchaseReturn,
      paymentIn,
      factureOut,
      factureOutDemand,
      documentSequence: mockDocumentSequence(),
      employee: { findUnique: vi.fn(async () => null) },
    },
    state: s,
  };
}

describe('FactureOutService.generateFromDemand (Chat-3 §82 parity, preserved)', () => {
  it('generates a draft facture linked to the parent Demand', async () => {
    const m = makePrismaMock({ demands: [DEMAND] });
    const svc = new FactureOutService({ client: m.client } as never);
    const r = (await svc.generateFromDemand('acc-1', 'emp-1', 'dem-1')) as FactureRow;
    expect(m.state.factures).toHaveLength(1);
    expect(r.demandId).toBe('dem-1');
    expect(r.state).toBe('draft');
    expect(r.ownerId).toBe('emp-1');
    expect(r.name).toMatch(/^СФ-\d{4}-\d{5}$/);
  });

  it('copies header refs losslessly from the Demand (§8.3 parity)', async () => {
    const m = makePrismaMock({ demands: [DEMAND] });
    const svc = new FactureOutService({ client: m.client } as never);
    const r = (await svc.generateFromDemand('acc-1', 'emp-1', 'dem-1')) as FactureRow;
    expect(r.agentId).toBe(DEMAND.agentId);
    expect(r.organizationId).toBe(DEMAND.organizationId);
    expect(r.currency).toBe('USD');
    expect(r.rateValue).toBe(1_250_000_000n);
    expect(r.vatEnabled).toBe(true);
    expect(r.vatIncluded).toBe(false);
    expect(r.sumMinor).toBe(9_999_99n);
    expect(r.vatSumMinor).toBe(1_666_66n);
  });

  it('is idempotent — one Demand yields exactly one FactureOut', async () => {
    const m = makePrismaMock({ demands: [DEMAND] });
    const svc = new FactureOutService({ client: m.client } as never);
    const a = (await svc.generateFromDemand('acc-1', 'emp-1', 'dem-1')) as FactureRow;
    const b = (await svc.generateFromDemand('acc-1', 'emp-1', 'dem-1')) as FactureRow;
    expect(b.id).toBe(a.id);
    expect(m.state.factures).toHaveLength(1);
    expect(m.client.factureOut.create).toHaveBeenCalledTimes(1);
  });

  it('throws NotFound when the Demand does not exist', async () => {
    const m = makePrismaMock({ demands: [] });
    const svc = new FactureOutService({ client: m.client } as never);
    await expect(svc.generateFromDemand('acc-1', 'emp-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('FactureOutService.generateFromDemands (§66 multi-source)', () => {
  const D2: DemandRow = { ...DEMAND, id: 'dem-2', sumMinor: 5_000_00n, vatSumMinor: 833_33n };

  it('aggregates sumMinor/vatSumMinor EXACTLY across demands + writes join rows', async () => {
    const m = makePrismaMock({ demands: [DEMAND, D2] });
    const svc = new FactureOutService({ client: m.client } as never);
    const r = (await svc.generateFromDemands('acc-1', 'emp-1', ['dem-1', 'dem-2'])) as FactureRow;
    expect(r.sumMinor).toBe(9_999_99n + 5_000_00n);
    expect(r.vatSumMinor).toBe(1_666_66n + 833_33n);
    expect(r.demandId).toBe('dem-1'); // denormalised primary
    expect(m.state.links.map((l) => l.demandId).sort()).toEqual(['dem-1', 'dem-2']);
  });

  it('rejects an empty id list', async () => {
    const m = makePrismaMock({ demands: [DEMAND] });
    const svc = new FactureOutService({ client: m.client } as never);
    await expect(svc.generateFromDemands('acc-1', 'emp-1', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects demands with a different agent/org/currency', async () => {
    const other: DemandRow = { ...DEMAND, id: 'dem-x', agentId: 'agent-OTHER' };
    const m = makePrismaMock({ demands: [DEMAND, other] });
    const svc = new FactureOutService({ client: m.client } as never);
    await expect(
      svc.generateFromDemands('acc-1', 'emp-1', ['dem-1', 'dem-x']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent for the same set, rejects partial overlap (no double-facture)', async () => {
    const m = makePrismaMock({ demands: [DEMAND, D2] });
    const svc = new FactureOutService({ client: m.client } as never);
    const a = (await svc.generateFromDemands('acc-1', 'emp-1', ['dem-1', 'dem-2'])) as FactureRow;
    const b = (await svc.generateFromDemands('acc-1', 'emp-1', ['dem-1', 'dem-2'])) as FactureRow;
    expect(b.id).toBe(a.id);
    await expect(svc.generateFromDemands('acc-1', 'emp-1', ['dem-1'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('FactureOutService.generateFromPurchaseReturn / PaymentIn (§66/§84)', () => {
  const PR: SourceRow = {
    id: 'pr-1',
    accountId: 'acc-1',
    deletedAt: null,
    agentId: 'agent-1',
    organizationId: 'org-1',
    currency: 'UZS',
    rateValue: 100_000_000n,
    vatEnabled: true,
    vatIncluded: false,
    sumMinor: 7_000_00n,
    vatSumMinor: 1_166_66n,
  };

  it('generates from a PurchaseReturn, idempotent', async () => {
    const m = makePrismaMock({ purchaseReturns: [PR] });
    const svc = new FactureOutService({ client: m.client } as never);
    const a = (await svc.generateFromPurchaseReturn('acc-1', 'emp-1', 'pr-1')) as FactureRow;
    const b = (await svc.generateFromPurchaseReturn('acc-1', 'emp-1', 'pr-1')) as FactureRow;
    expect(a.purchaseReturnId).toBe('pr-1');
    expect(a.sumMinor).toBe(7_000_00n);
    expect(b.id).toBe(a.id);
    expect(m.client.factureOut.create).toHaveBeenCalledTimes(1);
  });

  it('generates an advance facture from a PaymentIn with advanceVatRate', async () => {
    const pay: SourceRow = { ...PR, id: 'pi-1' };
    const m = makePrismaMock({ paymentsIn: [pay] });
    const svc = new FactureOutService({ client: m.client } as never);
    const r = (await svc.generateFromPaymentIn('acc-1', 'emp-1', 'pi-1', 12)) as FactureRow;
    expect(r.paymentInId).toBe('pi-1');
    expect(r.advanceVatRate).toBe(12);
    expect(r.sumMinor).toBe(7_000_00n);
  });

  it('throws NotFound for a missing PurchaseReturn / PaymentIn', async () => {
    const m = makePrismaMock({});
    const svc = new FactureOutService({ client: m.client } as never);
    await expect(svc.generateFromPurchaseReturn('acc-1', 'emp-1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.generateFromPaymentIn('acc-1', 'emp-1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
