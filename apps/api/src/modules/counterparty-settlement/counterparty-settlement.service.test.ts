import { describe, expect, it } from 'vitest';
import { CounterpartySettlementService } from './counterparty-settlement.service.js';

/**
 * Faza 12 — `DUP-12`: settlement debt-so'rovi `deletedAt`/`status` filtrsiz edi.
 *
 * TUZATISHDAN OLDINGI holat: `c.debt.findMany({ where: { accountId,
 * counterpartyId } })` — korzinaga tashlangan (soft-delete) qarz ham reyestr
 * qoldig'iga qo'shilardi. Oqibat: kontragentga imzo uchun ketadigan «Qabul
 * tovarlari» xlsx va akt-sverkada MAVJUD BO'LMAGAN qarz ko'rinardi
 * (`DUP-03` balans-tomoni bilan juft bug).
 *
 * NON-VACUOUS: filtr yo'q kodda 1-test 30 000 qo'shimcha qoldiq ko'rsatadi.
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';

interface DebtRow {
  accountId: string;
  counterpartyId: string;
  currency: string;
  totalMinor: bigint;
  paidMinor: bigint;
  status: string;
  deletedAt: Date | null;
}

interface DebtWhere {
  accountId?: string;
  counterpartyId?: string;
  deletedAt?: null;
  status?: { not?: string };
}

function makeSvc(debts: DebtRow[], balances: Array<{ currency: string; balanceMinor: bigint }>) {
  const client = {
    counterpartyBalance: {
      findMany: async () => balances.map((b) => ({ ...b })),
    },
    debt: {
      findMany: async (args: { where: DebtWhere }) => {
        const w = args.where;
        return debts
          .filter(
            (d) =>
              (w.accountId === undefined || d.accountId === w.accountId) &&
              (w.counterpartyId === undefined || d.counterpartyId === w.counterpartyId) &&
              (w.deletedAt === undefined || d.deletedAt === null) &&
              (w.status?.not === undefined || d.status !== w.status.not),
          )
          .map((d) => ({ currency: d.currency, totalMinor: d.totalMinor, paidMinor: d.paidMinor }));
      },
    },
  };
  return new CounterpartySettlementService({ client } as never);
}

const debt = (over: Partial<DebtRow> & { totalMinor: bigint }): DebtRow => ({
  accountId: ACC,
  counterpartyId: CP,
  currency: 'UZS',
  paidMinor: 0n,
  status: 'unpaid',
  deletedAt: null,
  ...over,
});

describe('CounterpartySettlementService.forCounterparty — DUP-12', () => {
  it("korzinaga tashlangan qarz reyestr qoldig'ida ko'rinmaydi", async () => {
    const svc = makeSvc(
      [
        debt({ totalMinor: 30_000n, deletedAt: new Date('2026-08-01T00:00:00Z') }),
        debt({ totalMinor: 20_000n }),
      ],
      [{ currency: 'UZS', balanceMinor: 20_000n }],
    );

    const s = await svc.forCounterparty(ACC, CP);

    expect(s.primary?.debtRegistryOutstandingMinor).toBe(20_000n);
  });

  it('bekor qilingan (cancelled) qarz ham qoldiqqa kirmaydi', async () => {
    const svc = makeSvc(
      [debt({ totalMinor: 50_000n, status: 'cancelled' }), debt({ totalMinor: 15_000n })],
      [],
    );

    const s = await svc.forCounterparty(ACC, CP);

    expect(s.primary?.debtRegistryOutstandingMinor).toBe(15_000n);
  });

  it("tirik qarzlar (unpaid/partial/paid) o'z qoldig'i bilan qoladi", async () => {
    const svc = makeSvc(
      [
        debt({ totalMinor: 100_000n, paidMinor: 40_000n, status: 'partial' }),
        debt({ totalMinor: 60_000n, paidMinor: 60_000n, status: 'paid' }),
      ],
      [],
    );

    const s = await svc.forCounterparty(ACC, CP);

    // `paid` so'rovdan chiqarilmaydi — qoldiqni total−paid o'zi 0 qiladi
    // (status-drift'ga bardosh, servis docstringi).
    expect(s.primary?.debtRegistryOutstandingMinor).toBe(60_000n);
  });
});
