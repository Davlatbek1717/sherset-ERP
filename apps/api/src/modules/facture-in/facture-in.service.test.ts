import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { FactureInService } from './facture-in.service.js';

/**
 * Service coverage for the §66 multi-source generation flow (extends
 * Chat-3 §82-84). In-memory Prisma-mock — Chat-3 single-Supply parity
 * preserved verbatim + multi-Supply aggregation, PaymentOut-based,
 * idempotency and adversarial guards.
 */

interface SupplyRow {
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
  incomingNumber: string | null;
  incomingDate: Date | null;
}
interface PayRow {
  id: string;
  accountId: string;
  deletedAt: Date | null;
  agentId: string;
  organizationId: string;
  currency: string;
  rateValue: bigint;
  sumMinor: bigint;
  vatSumMinor: bigint;
}
interface FactureRow {
  id: string;
  accountId: string;
  deletedAt: Date | null;
  name: string;
  supplyId: string | null;
  paymentOutId: string | null;
  agentId: string;
  organizationId: string;
  currency: string;
  rateValue: bigint;
  vatEnabled: boolean;
  vatIncluded: boolean;
  sumMinor: bigint;
  vatSumMinor: bigint;
  incomingNumber: string | null;
  incomingDate: Date | null;
  state: string;
  ownerId: string | null;
}
interface LinkRow {
  id: string;
  accountId: string;
  factureInId: string;
  supplyId: string;
}

const INC_DATE = new Date('2026-04-20T00:00:00Z');
const SUPPLY: SupplyRow = {
  id: 'sup-1',
  accountId: 'acc-1',
  deletedAt: null,
  agentId: 'agent-9',
  organizationId: 'org-9',
  currency: 'EUR',
  rateValue: 1_180_000_000n,
  vatEnabled: true,
  vatIncluded: true,
  sumMinor: 4_200_00n,
  vatSumMinor: 700_00n,
  incomingNumber: 'SUP-2026/77',
  incomingDate: INC_DATE,
};

interface MockState {
  supplies: SupplyRow[];
  paymentsOut: PayRow[];
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
    supplies: state.supplies ?? [],
    paymentsOut: state.paymentsOut ?? [],
    factures: state.factures ?? [],
    links: state.links ?? [],
  };
  let seq = 0;
  let linkSeq = 0;

  const supply = {
    findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const w = args.where ?? {};
      const ids = inList(w.id) ?? [];
      return s.supplies.filter(
        (x) => ids.includes(x.id) && x.accountId === w.accountId && x.deletedAt === null,
      );
    }),
  };
  const paymentOut = {
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const w = args.where ?? {};
      return (
        s.paymentsOut.find(
          (p) => p.id === w.id && p.accountId === w.accountId && p.deletedAt === null,
        ) ?? null
      );
    }),
  };
  const factureIn = {
    // MASTER-TODO #21: the number seeder calls
    // `factureIn.findMany({ where: { accountId }, select: { name: true } })`.
    // The mock predated that allocator, so every generate* test died on
    // «factureIn.findMany is not a function» — a mock gap reported as service
    // breakage. Modelled faithfully (account-scoped, name-only).
    findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const w = args.where ?? {};
      return s.factures.filter((f) => f.accountId === w.accountId).map((f) => ({ name: f.name }));
    }),
    findFirst: vi.fn(async (args: { where: Record<string, unknown>; include?: unknown }) => {
      const w = args.where ?? {};
      if (w.name && typeof w.name === 'object') {
        const prefix = (w.name as { startsWith: string }).startsWith;
        const matched = s.factures
          .filter((f) => f.accountId === w.accountId && f.name.startsWith(prefix))
          .sort((a, b) => (a.name < b.name ? 1 : -1));
        return matched[0] ?? null;
      }
      const idIn = inList(w.supplyId);
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
            f.supplyId != null &&
            idIn.includes(f.supplyId),
        );
      } else {
        row = s.factures.find(
          (f) =>
            f.accountId === w.accountId &&
            f.deletedAt === null &&
            (w.supplyId === undefined || f.supplyId === w.supplyId) &&
            (w.paymentOutId === undefined || f.paymentOutId === w.paymentOutId),
        );
      }
      if (!row) return null;
      if (args.include && typeof args.include === 'object' && 'supplyLinks' in args.include) {
        return {
          ...row,
          supplyLinks: s.links
            .filter((l) => l.factureInId === row?.id)
            .map((l) => ({ supplyId: l.supplyId })),
        };
      }
      return row;
    }),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      seq += 1;
      const data = args.data;
      const links = data.supplyLinks as { create: Array<{ supplyId: string }> } | undefined;
      const row: FactureRow = {
        id: `fi-${seq}`,
        accountId: 'acc-1',
        deletedAt: null,
        name: '',
        supplyId: null,
        paymentOutId: null,
        agentId: '',
        organizationId: '',
        currency: 'UZS',
        rateValue: 100_000_000n,
        vatEnabled: true,
        vatIncluded: false,
        sumMinor: 0n,
        vatSumMinor: 0n,
        incomingNumber: null,
        incomingDate: null,
        state: 'draft',
        ownerId: null,
        ...(data as Partial<FactureRow>),
      };
      (row as unknown as Record<string, unknown>).supplyLinks = undefined;
      s.factures.push(row);
      for (const l of links?.create ?? []) {
        linkSeq += 1;
        s.links.push({
          id: `fil-${linkSeq}`,
          accountId: 'acc-1',
          factureInId: row.id,
          supplyId: l.supplyId,
        });
      }
      return row;
    }),
  };
  const factureInSupply = {
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const w = args.where ?? {};
      const ids = inList(w.supplyId) ?? [];
      const link = s.links.find((l) => l.accountId === w.accountId && ids.includes(l.supplyId));
      return link ? { factureInId: link.factureInId } : null;
    }),
  };

  return {
    client: {
      supply,
      paymentOut,
      factureIn,
      factureInSupply,
      documentSequence: mockDocumentSequence(),
      employee: { findUnique: vi.fn(async () => null) },
    },
    state: s,
  };
}

describe('FactureInService.generateFromSupply (Chat-3 §82 parity, preserved)', () => {
  it('generates a draft facture linked to the parent Supply', async () => {
    const m = makePrismaMock({ supplies: [SUPPLY] });
    const svc = new FactureInService({ client: m.client } as never);
    const r = (await svc.generateFromSupply('acc-1', 'emp-1', 'sup-1')) as FactureRow;
    expect(m.state.factures).toHaveLength(1);
    expect(r.supplyId).toBe('sup-1');
    expect(r.state).toBe('draft');
    // MASTER-TODO #21: was /^СФП-\d{4}-\d{5}$/ — the legacy prefixed format the
    // generator stopped emitting when it moved to moysklad's prefix-less «Номер».
    expect(r.name).toMatch(/^\d{5}$/);
  });

  it('continues the sequence past legacy PREFIXED names (no number reuse)', async () => {
    const m = makePrismaMock({
      supplies: [SUPPLY],
      factures: [
        {
          id: 'f-legacy',
          accountId: 'acc-1',
          name: 'СФП-2026-00042',
          supplyId: null,
          state: 'draft',
          deletedAt: null,
        } as never,
      ],
    });
    const svc = new FactureInService({ client: m.client } as never);
    const r = (await svc.generateFromSupply('acc-1', 'emp-1', 'sup-1')) as FactureRow;
    expect(r.name).toBe('00043');
  });

  it('copies header refs + supplier incomingNumber/Date losslessly', async () => {
    const m = makePrismaMock({ supplies: [SUPPLY] });
    const svc = new FactureInService({ client: m.client } as never);
    const r = (await svc.generateFromSupply('acc-1', 'emp-1', 'sup-1')) as FactureRow;
    expect(r.agentId).toBe(SUPPLY.agentId);
    expect(r.organizationId).toBe(SUPPLY.organizationId);
    expect(r.currency).toBe('EUR');
    expect(r.rateValue).toBe(1_180_000_000n);
    expect(r.vatIncluded).toBe(true);
    expect(r.sumMinor).toBe(4_200_00n);
    expect(r.vatSumMinor).toBe(700_00n);
    expect(r.incomingNumber).toBe('SUP-2026/77');
    expect(r.incomingDate).toBe(INC_DATE);
  });

  it('is idempotent — one Supply yields exactly one FactureIn', async () => {
    const m = makePrismaMock({ supplies: [SUPPLY] });
    const svc = new FactureInService({ client: m.client } as never);
    const a = (await svc.generateFromSupply('acc-1', 'emp-1', 'sup-1')) as FactureRow;
    const b = (await svc.generateFromSupply('acc-1', 'emp-1', 'sup-1')) as FactureRow;
    expect(b.id).toBe(a.id);
    expect(m.state.factures).toHaveLength(1);
    expect(m.client.factureIn.create).toHaveBeenCalledTimes(1);
  });

  it('throws NotFound when the Supply does not exist', async () => {
    const m = makePrismaMock({ supplies: [] });
    const svc = new FactureInService({ client: m.client } as never);
    await expect(svc.generateFromSupply('acc-1', 'emp-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('FactureInService.generateFromSupplies / PaymentOut (§66)', () => {
  const S2: SupplyRow = {
    ...SUPPLY,
    id: 'sup-2',
    sumMinor: 1_800_00n,
    vatSumMinor: 300_00n,
  };

  it('aggregates EXACTLY across supplies + writes join rows', async () => {
    const m = makePrismaMock({ supplies: [SUPPLY, S2] });
    const svc = new FactureInService({ client: m.client } as never);
    const r = (await svc.generateFromSupplies('acc-1', 'emp-1', ['sup-1', 'sup-2'])) as FactureRow;
    expect(r.sumMinor).toBe(4_200_00n + 1_800_00n);
    expect(r.vatSumMinor).toBe(700_00n + 300_00n);
    expect(r.supplyId).toBe('sup-1');
    expect(m.state.links.map((l) => l.supplyId).sort()).toEqual(['sup-1', 'sup-2']);
  });

  it('rejects empty list / cross-agent / partial overlap', async () => {
    const other: SupplyRow = { ...SUPPLY, id: 'sup-x', agentId: 'agent-OTHER' };
    const m = makePrismaMock({ supplies: [SUPPLY, S2, other] });
    const svc = new FactureInService({ client: m.client } as never);
    await expect(svc.generateFromSupplies('acc-1', 'emp-1', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.generateFromSupplies('acc-1', 'emp-1', ['sup-1', 'sup-x']),
    ).rejects.toBeInstanceOf(BadRequestException);
    await svc.generateFromSupplies('acc-1', 'emp-1', ['sup-1', 'sup-2']);
    await expect(svc.generateFromSupplies('acc-1', 'emp-1', ['sup-2'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('generates from a PaymentOut, idempotent', async () => {
    const pay: PayRow = {
      id: 'po-1',
      accountId: 'acc-1',
      deletedAt: null,
      agentId: 'agent-9',
      organizationId: 'org-9',
      currency: 'UZS',
      rateValue: 100_000_000n,
      sumMinor: 3_300_00n,
      vatSumMinor: 550_00n,
    };
    const m = makePrismaMock({ paymentsOut: [pay] });
    const svc = new FactureInService({ client: m.client } as never);
    const a = (await svc.generateFromPaymentOut('acc-1', 'emp-1', 'po-1')) as FactureRow;
    const b = (await svc.generateFromPaymentOut('acc-1', 'emp-1', 'po-1')) as FactureRow;
    expect(a.paymentOutId).toBe('po-1');
    expect(a.sumMinor).toBe(3_300_00n);
    expect(b.id).toBe(a.id);
    expect(m.client.factureIn.create).toHaveBeenCalledTimes(1);
  });

  it('throws NotFound for a missing PaymentOut', async () => {
    const m = makePrismaMock({});
    const svc = new FactureInService({ client: m.client } as never);
    await expect(svc.generateFromPaymentOut('acc-1', 'emp-1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
