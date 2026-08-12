import { describe, expect, it, vi } from 'vitest';
import { InvoiceOutService } from '../invoice-out/invoice-out.service.js';
import { SalesReturnService } from './sales-return.service.js';

/**
 * P14 / `H1` — MIJOZ QAYTARISHI KONTRAGENT BALANSIGA YOZILADI.
 *
 * TUZATISHDAN OLDINGI nosozlik (reja §1.H, `[O'LCHANGAN]`): `SalesReturn.post`
 * FAQAT qoldiqqa yozardi (`stock.applyDeltas`) — `CounterpartyBalanceService`
 * servisda import ham qilinmagan edi. Ya'ni mijoz tovarni qaytarsa qoldiq
 * ortardi, lekin uning BIZGA bo'lgan qarzi kamaymasdi: hisob-faktura (`InvoiceOut`,
 * `+sumMinor`) yozgan qarz abadiy osilib qolardi va kassada shu yolg'on summa
 * to'lanadigan qarz sifatida ko'rinardi (P1/P2 `debtPayable` = max(reyestr, balans)).
 *
 * Bu — `purchase-return` (`PP-02`, `supplier-debt-supply-only.test.ts`) ning
 * MIJOZ tomonidagi ko'zgusi. Ishora `counterparty-balance.service.ts` shartnomasi
 * bo'yicha: musbat = mijoz BIZGA qarzdor ⇒ qaytarish qarzni KAMAYTIRADI ⇒
 * `−sumMinor`; unpost/cancel esa aynan teskarisini yozadi (nol-yig'indi).
 *
 * NON-VACUOUS (tuzatishdan OLDIN o'lchangan — `git stash` bilan emas, qo'shishdan
 * oldingi yugurtirishda): 6/6 test yiqildi — `applyDelta` UMUMAN chaqirilmasdi
 * (`deltas` har doim `[]`, `balanceOf()` har doim InvoiceOut summasi).
 */

const ACC = 'acc-1';
const USER = 'usr-1';
const CP = 'cp-1'; // mijoz (xaridor)
const ORG = 'org-1';
const STORE = 'st-1';
const PRODUCT = 'prd-1';

/** 10 dona × 400 000.00 so'm = 4 000 000 tiyin — hisob-faktura va qaytarish uchun bir xil. */
const SUM = 4_000_000n;
const QTY = '10';
const PRICE = 400_000n;

type Row = Record<string, unknown> & { id: string; accountId: string; state: string };

/** Kontragent bosh daftari — ikkala servis SHU bitta daftarga yozadi. */
function makeLedger() {
  const deltas: Array<{ deltaMinor: bigint; docType?: string; docId?: string }> = [];
  let balanceMinor = 0n;
  const balance = {
    applyDelta: vi.fn(
      async (
        _tx: unknown,
        _accountId: string,
        _counterpartyId: string,
        _currency: string,
        deltaMinor: bigint,
        meta?: { docType?: string; docId?: string },
      ) => {
        balanceMinor += deltaMinor;
        deltas.push({ deltaMinor, docType: meta?.docType, docId: meta?.docId });
      },
    ),
  };
  return { balance, deltas, balanceOf: () => balanceMinor };
}

/**
 * Bitta hujjat qatori uchun Prisma dubli. `updateMany` WHERE'dagi `state`
 * shartini HURMAT QILADI (atomik claim shu shartga tayanadi), `findFirst` esa
 * uzilgan (detached) nusxa qaytaradi — xuddi Prisma kabi.
 */
function docDelegate(row: Row) {
  const snap = () => ({
    ...row,
    positions: ((row.positions as Array<Record<string, unknown>>) ?? []).map((p) => ({ ...p })),
  });
  return {
    findFirst: vi.fn(async () => snap()),
    findUnique: vi.fn(async () => snap()),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => {
      Object.assign(row, args.data);
      return snap();
    }),
    updateMany: vi.fn(
      async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const w = args.where;
        if (w.id !== undefined && w.id !== row.id) return { count: 0 };
        if (w.accountId !== undefined && w.accountId !== row.accountId) return { count: 0 };
        const st = w.state as string | { in?: string[] } | undefined;
        if (st !== undefined) {
          const allowed = typeof st === 'string' ? [st] : (st.in ?? []);
          if (!allowed.includes(row.state)) return { count: 0 };
        }
        Object.assign(row, args.data);
        return { count: 1 };
      },
    ),
  };
}

const invoiceOutRow = (): Row => ({
  id: 'io-1',
  accountId: ACC,
  name: 'СЧ-2026-00001',
  agentId: CP,
  organizationId: ORG,
  storeId: STORE,
  customerOrderId: null,
  currency: 'UZS',
  rateValue: 100_000_000n,
  sumMinor: SUM,
  payedSumMinor: 0n,
  vatSumMinor: 0n,
  vatEnabled: false,
  vatIncluded: false,
  state: 'draft',
  applicable: false,
  postedAt: null,
  deletedAt: null,
  groupId: null,
  version: 1,
  moment: new Date('2026-08-12T00:00:00.000Z'),
  positions: [],
});

const salesReturnRow = (): Row => ({
  id: 'sr-1',
  accountId: ACC,
  name: 'ВП-2026-00001',
  agentId: CP,
  organizationId: ORG,
  storeId: STORE,
  demandId: null,
  customerOrderId: null,
  currency: 'UZS',
  rateValue: 100_000_000n,
  sumMinor: SUM,
  vatSumMinor: 0n,
  payedSumMinor: 0n,
  vatEnabled: false,
  vatIncluded: false,
  state: 'draft',
  applicable: false,
  postedAt: null,
  deletedAt: null,
  groupId: null,
  version: 1,
  moment: new Date('2026-08-12T00:00:00.000Z'),
  positions: [
    {
      id: 'srp-1',
      position: 1,
      assortmentKind: 'product',
      assortmentId: PRODUCT,
      productId: PRODUCT,
      // ATAYLAB `null`: «Отгрузка» bog'lanishi bu testning predmeti emas —
      // o'lchanayotgani BALANS deltasi, qty-integrity qo'riqchisi emas.
      demandPositionId: null,
      quantity: QTY,
      priceMinor: PRICE,
      discount: '0',
      vat: null,
      vatEnabled: false,
      cellId: null,
      costMinor: PRICE,
      product: { id: PRODUCT, name: 'Tovar', code: 'T-1', uom: null },
      country: null,
    },
  ],
});

/**
 * Ikkala servis (Hisob-faktura · Mijoz qaytarishi) BITTA daftar va BITTA
 * prisma-dubli ustida — «bir savdo, ikki hujjat» oqimini aynan shunday
 * o'lchash mumkin.
 */
function makeWorld() {
  const ledger = makeLedger();
  const rows = {
    invoiceOut: invoiceOutRow(),
    salesReturn: salesReturnRow(),
  };
  const delegates = {
    invoiceOut: docDelegate(rows.invoiceOut),
    salesReturn: docDelegate(rows.salesReturn),
  };

  const client: Record<string, unknown> = {
    invoiceOut: delegates.invoiceOut,
    salesReturn: delegates.salesReturn,
    salesReturnPosition: {
      groupBy: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    demandPosition: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    store: { findFirst: vi.fn(async () => ({ id: STORE, allowNegativeStock: false })) },
    group: { findFirst: vi.fn(async () => null) },
    auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));

  const stock = {
    applyDeltas: vi.fn(async () => undefined),
    lockBalances: vi.fn(
      async () => new Map([[PRODUCT, { qty: QTY, costBalanceMinor: String(SUM) }]]),
    ),
    getBalances: vi.fn(async () => new Map()),
    assertCellsInStore: vi.fn(async () => undefined),
    assertAvailable: vi.fn(() => undefined),
  };
  const co = {
    applyShipment: vi.fn(async () => undefined),
    adjustReservationForShipment: vi.fn(async () => undefined),
    applyInvoice: vi.fn(async () => undefined),
  };
  const webhookFire = { fireForEvent: vi.fn() };
  const events = { emit: vi.fn() };
  const prisma = { client } as never;

  const invoiceOut = new InvoiceOutService(
    prisma,
    co as never,
    ledger.balance as never,
    {} as never, // attrs
    webhookFire as never,
  );
  const salesReturn = new SalesReturnService(
    prisma,
    stock as never,
    co as never,
    {} as never, // attrs
    webhookFire as never,
    events as never,
    ledger.balance as never,
  );

  return { ledger, rows, svc: { invoiceOut, salesReturn }, co, stock };
}

describe('Mijoz qaytarishi — balans simmetriyasi (H1)', () => {
  it("post() mijoz qarzini KAMAYTIRADI (−sumMinor) va o'z hujjatiga havola qoldiradi", async () => {
    const { ledger, svc } = makeWorld();

    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'post');

    expect(ledger.deltas).toEqual([{ deltaMinor: -SUM, docType: 'salesReturn', docId: 'sr-1' }]);
    expect(ledger.balanceOf()).toBe(-SUM);
  });

  it("to'liq qaytarish hisob-faktura yozgan qarzni AYNAN nolga tushiradi", async () => {
    const { ledger, svc } = makeWorld();

    await svc.invoiceOut.transition(ACC, USER, 'io-1', 'post');
    expect(ledger.balanceOf()).toBe(SUM);

    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'post');

    expect(ledger.balanceOf()).toBe(0n);
    expect(ledger.deltas.map((d) => d.deltaMinor)).toEqual([SUM, -SUM]);
  });

  it("qaytarishni unpost qilish qarzni QAYTA tiklaydi (post bilan nol-yig'indi)", async () => {
    const { ledger, svc } = makeWorld();

    await svc.invoiceOut.transition(ACC, USER, 'io-1', 'post');
    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'post');
    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'unpost');

    expect(ledger.balanceOf()).toBe(SUM);
    expect(ledger.deltas.map((d) => d.deltaMinor)).toEqual([SUM, -SUM, SUM]);
  });

  it("o'tkazilgan qaytarishni cancel qilish ham deltani qaytaradi", async () => {
    const { ledger, svc } = makeWorld();

    await svc.invoiceOut.transition(ACC, USER, 'io-1', 'post');
    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'post');
    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'cancel');

    expect(ledger.balanceOf()).toBe(SUM);
    expect(ledger.deltas.map((d) => d.deltaMinor)).toEqual([SUM, -SUM, SUM]);
  });

  it('draft qaytarishni cancel qilish balansga TEGMAYDI (applicable emas)', async () => {
    const { ledger, svc } = makeWorld();

    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'cancel');

    expect(ledger.deltas).toEqual([]);
    expect(ledger.balanceOf()).toBe(0n);
  });

  it("post → unpost → post sikli qo'sh yozmaydi (har bosqich AYNAN bitta delta)", async () => {
    const { ledger, svc } = makeWorld();

    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'post');
    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'unpost');
    await svc.salesReturn.transition(ACC, USER, 'sr-1', 'post');

    expect(ledger.deltas.map((d) => d.deltaMinor)).toEqual([-SUM, SUM, -SUM]);
    expect(ledger.balanceOf()).toBe(-SUM);
  });
});
