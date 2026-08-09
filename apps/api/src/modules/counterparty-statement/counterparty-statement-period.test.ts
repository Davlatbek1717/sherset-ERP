import { describe, expect, it } from 'vitest';
import { OPENING_DOC_TYPE } from '../counterparty-balance/counterparty-balance-doc-types.js';
import { CounterpartyStatementService } from './counterparty-statement.service.js';

/**
 * FAZA Q6 (`PERF-02`) — AKT-SVERKA DAVR O'QI.
 *
 * Faza 10 da statement manbasi `CounterpartyBalanceEntry` jurnaliga ko'chgan,
 * lekin davr tushunchasi bo'lmagan: har akt BUTUN tarixni tortardi va
 * «boshlang'ich qoldiq» qatori yo'q edi. Davr-mashinasi (`foldJournalPeriod`)
 * o'sha fazadayoq yozilgan — akt-sverka uni ishlatmasdi xolos.
 *
 * Bu yerda uch narsa qulflanadi:
 *   1. davr ichidagi qatorlar + davr-boshi saldo == jurnal folding'i;
 *   2. davrsiz (to = hozir) yakun materiallashgan balansga TENG qoladi —
 *      Faza 10 invarianti davr o'qi qo'shilgach ham buzilmaydi;
 *   3. tovar pozitsiyalari davr TASHQARISIDAGI hujjatlar uchun UMUMAN
 *      tortilmaydi (`PERF-02` ning perf qismi), product-filtr rejimi esa
 *      regresssiz ishlaydi va davrni hujjat sanasi bo'yicha kesadi.
 */

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CP = '22222222-2222-4222-8222-222222222222';
const PRODUCT = '55555555-5555-4555-8555-555555555555';

interface Row {
  organizationId: string | null;
  deltaMinor: bigint;
  docType: string;
  docId: string | null;
  createdAt: Date;
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 10, 0, 0));

/**
 * Jurnal (`applyDelta` yozgan qatorlar) + hujjat kartochkalari. Sanalar
 * ATAYLAB `createdAt` dan farq qiladi: `opening` bugun backfill qilingan,
 * `su-1` esa orqaga sanalgan (iyul hujjati, avgustda post qilingan) — davr
 * kesimi hujjatning O'Z sanasi bo'yicha ketishi shu bilan tekshiriladi.
 */
const JOURNAL: Row[] = [
  {
    organizationId: null,
    deltaMinor: 250_000n,
    docType: OPENING_DOC_TYPE,
    docId: null,
    createdAt: utc(2026, 8, 9),
  },
  {
    organizationId: null,
    deltaMinor: 1_000_000n,
    docType: 'invoiceOut',
    docId: 'io-1',
    createdAt: utc(2026, 6, 10),
  },
  {
    organizationId: null,
    deltaMinor: -300_000n,
    docType: 'paymentIn',
    docId: 'pi-1',
    createdAt: utc(2026, 7, 5),
  },
  {
    organizationId: null,
    deltaMinor: -400_000n,
    docType: 'supply',
    docId: 'su-1',
    createdAt: utc(2026, 8, 2),
  },
  {
    organizationId: null,
    deltaMinor: 500_000n,
    docType: 'invoiceOut',
    docId: 'io-2',
    createdAt: utc(2026, 8, 3),
  },
];

/** Σ(jurnal) — materiallashgan `CounterpartyBalance.balanceMinor` ning aynan o'zi. */
const MATERIALIZED = JOURNAL.reduce((s, r) => s + r.deltaMinor, 0n);

const DOCS: Record<string, Array<{ id: string; name: string; moment: Date }>> = {
  invoiceOut: [
    { id: 'io-1', name: 'СЧ-00001', moment: utc(2026, 6, 10) },
    { id: 'io-2', name: 'СЧ-00002', moment: utc(2026, 8, 3) },
  ],
  paymentIn: [{ id: 'pi-1', name: 'ВП-00001', moment: utc(2026, 7, 5) }],
  // Orqaga sanalgan: hujjat sanasi 20-iyul, jurnalga 2-avgustda tushgan.
  supply: [{ id: 'su-1', name: 'ПР-00001', moment: utc(2026, 7, 20) }],
};

interface Recorded {
  ids: string[];
  withPositions: boolean;
  where: Record<string, unknown>;
}

function makeClient() {
  const calls: Record<string, Recorded[]> = {};
  const record = (type: string, r: Recorded) => {
    const list = calls[type] ?? [];
    calls[type] = list;
    list.push(r);
  };

  const position = {
    quantity: '2',
    priceMinor: 100_000n,
    discount: '0',
    vat: null,
    vatEnabled: false,
    product: { name: 'Sement' },
  };

  const goods = (type: string) => ({
    findMany: async (a: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    }) => {
      const withPositions = 'positions' in a.select;
      const idFilter = a.where.id as { in: string[] } | undefined;
      if (!idFilter) {
        // PRODUCT-filtr rejimi: `positions: { some: { productId } }`.
        record(type, { ids: [], withPositions, where: a.where });
        const list = DOCS[type] ?? [];
        const bounds = a.where.moment as { gte?: Date; lt?: Date } | undefined;
        return list
          .filter(
            (d) =>
              !bounds ||
              ((!bounds.gte || d.moment >= bounds.gte) && (!bounds.lt || d.moment < bounds.lt)),
          )
          .map((d) => ({
            moment: d.moment,
            name: d.name,
            sumMinor: 200_000n,
            vatEnabled: false,
            vatIncluded: false,
            positions: [position],
          }));
      }
      record(type, { ids: idFilter.in, withPositions, where: a.where });
      return (DOCS[type] ?? [])
        .filter((d) => idFilter.in.includes(d.id))
        .map((d) => ({
          id: d.id,
          name: d.name,
          moment: d.moment,
          contractId: null,
          vatEnabled: false,
          vatIncluded: false,
          positions: withPositions ? [position] : [],
        }));
    },
  });

  const empty = { findMany: async () => [] };

  const client = {
    counterpartyBalanceEntry: {
      findMany: async () =>
        [...JOURNAL].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
    counterparty: {
      findFirst: async () => ({ id: CP, name: 'ООО «Тест»', phone: null }),
    },
    product: { findFirst: async () => ({ name: 'Sement' }) },
    invoiceOut: goods('invoiceOut'),
    invoiceIn: goods('invoiceIn'),
    supply: goods('supply'),
    purchaseReturn: goods('purchaseReturn'),
    paymentIn: goods('paymentIn'),
    paymentOut: empty,
    cashIn: empty,
    cashOut: empty,
    prepayment: empty,
    prepaymentReturn: empty,
    counterpartyAdjustment: empty,
    debt: empty,
    debtPayment: empty,
    retailSale: empty,
  };
  return { client, calls };
}

function svcOf(client: unknown) {
  return new CounterpartyStatementService({ client } as never, {} as never);
}

describe('Faza Q6 — akt-sverka davr-filtri + saldo-forward (PERF-02)', () => {
  it('(1) davr ichidagi qatorlar + davr-boshi saldo == jurnal folding’i', async () => {
    const { client } = makeClient();
    const { data } = await svcOf(client).aggregate(ACCOUNT, CP, {
      from: new Date('2026-07-01'),
      to: new Date('2026-07-31'),
    });

    // Davr boshigacha: opening (250 000, backfill BUGUN yozilgan bo'lsa ham)
    // + iyun sotuvi (1 000 000).
    expect(data.openingMinor).toBe(1_250_000n);
    // Davr ichida: to'lov (5-iyul) + orqaga sanalgan qabul (20-iyul).
    expect(data.lines.map((l) => l.docType)).toEqual(['paymentIn', 'supply']);
    expect(data.totalDebitMinor).toBe(0n);
    expect(data.totalCreditMinor).toBe(700_000n);
    // Running balans davr-boshi qoldig'idan boshlanadi — noldan emas.
    expect(data.lines[0]?.runningBalanceMinor).toBe(950_000n);
    expect(data.finalBalanceMinor).toBe(550_000n);
    // Ichki izchillik: opening + debet − kredit == yakun.
    expect(data.openingMinor + data.totalDebitMinor - data.totalCreditMinor).toBe(
      data.finalBalanceMinor,
    );
  });

  it('(2) davrsiz (to = hozir) yakun materiallashgan balansga TENG (Faza 10 invarianti)', async () => {
    const { client } = makeClient();
    const { data } = await svcOf(client).aggregate(ACCOUNT, CP);
    expect(data.finalBalanceMinor).toBe(MATERIALIZED);
    // `opening` qatori endi QATOR emas, davr-boshi qoldig'i.
    expect(data.openingMinor).toBe(250_000n);
    expect(data.lines.map((l) => l.docType)).not.toContain(OPENING_DOC_TYPE);
    expect(data.lines).toHaveLength(4);
  });

  it("(2b) davr butun tarixni qamrasa ham yakun o'zgarmaydi", async () => {
    const { client } = makeClient();
    const { data } = await svcOf(client).aggregate(ACCOUNT, CP, {
      from: new Date('2020-01-01'),
      to: new Date('2030-01-01'),
    });
    expect(data.finalBalanceMinor).toBe(MATERIALIZED);
  });

  it('(3) tovar pozitsiyalari faqat DAVR ICHIDAGI hujjatlar uchun tortiladi', async () => {
    const { client, calls } = makeClient();
    await svcOf(client).aggregate(ACCOUNT, CP, {
      from: new Date('2026-07-01'),
      to: new Date('2026-07-31'),
    });
    const withPos = (calls.invoiceOut ?? []).filter((c) => c.withPositions);
    // Iyun/avgust sotuvlari davr tashqarisida ⇒ ular uchun pozitsiya so'ralmaydi.
    expect(withPos).toHaveLength(0);
    const supplyPos = (calls.supply ?? []).filter((c) => c.withPositions);
    expect(supplyPos).toHaveLength(1);
    expect(supplyPos[0]?.ids).toEqual(['su-1']);
  });

  it('(4) product-filtr rejimi regresssiz + davrni hujjat sanasi bo’yicha kesadi', async () => {
    const { client, calls } = makeClient();
    const full = await svcOf(client).aggregate(ACCOUNT, CP, { productId: PRODUCT });
    expect(full.productName).toBe('Sement');
    // 2 sotuv (+) va 1 qabul (−), har biri 200 000 tiyin pozitsiya bilan.
    expect(full.data.lines).toHaveLength(3);
    expect(full.data.finalBalanceMinor).toBe(200_000n);

    const { client: c2, calls: calls2 } = makeClient();
    const july = await svcOf(c2).aggregate(ACCOUNT, CP, {
      productId: PRODUCT,
      from: new Date('2026-07-01'),
      to: new Date('2026-07-31'),
    });
    expect(july.data.lines.map((l) => l.docType)).toEqual(['supply']);
    // Kesish SQL darajasida (RAM'da emas) — `moment` chegaralari so'rovda.
    expect(calls2.invoiceOut?.[0]?.where.moment).toBeTruthy();
    expect(calls.invoiceOut?.[0]?.where.moment).toBeUndefined();
  });
});
