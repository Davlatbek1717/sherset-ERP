import { describe, expect, it, vi } from 'vitest';
import { InvoiceInService } from '../invoice-in/invoice-in.service.js';
import { SupplyService } from '../supply/supply.service.js';
import { PurchaseReturnService } from './purchase-return.service.js';

/**
 * Faza 13 — `PP-02` + `PP-03`: TAMINOTCHI QARZI ENDI FAQAT «QABUL» (Supply)
 * ORQALI YURITILADI (QAROR-B, foydalanuvchi 2026-08-08).
 *
 * TUZATISHDAN OLDINGI ikki nosozlik (ikkalasi ham shu faylda qulflanadi):
 *
 *   PP-03 (qarz 2×): `Supply.post` HAM, `InvoiceIn.post` HAM `-sumMinor` yozardi.
 *     Standart xarid oqimi PO → hisob-faktura (InvoiceIn) + qabul (Supply) bo'lgani
 *     uchun bitta xarid yetkazib beruvchi balansida IKKI marta qarz bo'lib turardi.
 *     InvoiceIn'da `supplyId` FK yo'q ⇒ dedup imkonsiz, ya'ni yagona yechim —
 *     kanallardan birini balansdan uzish.
 *
 *   PP-02 (qaytarish yo'q): `PurchaseReturn.post` balansga UMUMAN tegmasdi
 *     (servisda `CounterpartyBalanceService` import ham qilinmagan edi). To'liq
 *     qaytarilgan qabul bo'yicha «biz qarzdormiz» summasi abadiy qolardi.
 *
 * NON-VACUOUS (tuzatishdan OLDIN o'lchangan):
 *   1-test  — daftar `0` o'rniga `-4 000 000` (InvoiceIn o'z deltasini yozardi);
 *   2-test  — `[-4 000 000]` o'rniga `[-4 000 000, -4 000 000]` (qarz 2×);
 *   3-test  — qaytarishdan keyin `0` o'rniga `-4 000 000` (reversal yo'q edi);
 *   4/5-test — qaytarishning unpost/cancel teskarisi umuman yozilmasdi.
 */

const ACC = 'acc-1';
const USER = 'usr-1';
const CP = 'cp-1'; // yetkazib beruvchi
const ORG = 'org-1';
const STORE = 'st-1';
const PRODUCT = 'prd-1';
const PO_ID = 'po-1';
const PO_POS = 'pop-1';
const SUPPLY_POS = 'sp-1';

/** 10 dona × 400 000.00 so'm = 4 000 000 tiyin — Supply va qaytarish uchun bir xil. */
const SUM = 4_000_000n;
const QTY = '10';
const PRICE = 400_000n;

type Row = Record<string, unknown> & { id: string; accountId: string; state: string };

/** Kontragent bosh daftari — uchala servis SHU bitta daftarga yozadi. */
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

const supplyRow = (): Row => ({
  id: 'sup-1',
  accountId: ACC,
  name: 'ПРМ-00001',
  agentId: CP,
  organizationId: ORG,
  storeId: STORE,
  purchaseOrderId: PO_ID,
  currency: 'UZS',
  rateValue: 100_000_000n,
  sumMinor: SUM,
  vatSumMinor: 0n,
  overheadSumMinor: 0n,
  overheadDistribution: 'WEIGHT',
  vatEnabled: false,
  vatIncluded: false,
  state: 'draft',
  applicable: false,
  postedAt: null,
  deletedAt: null,
  groupId: null,
  moment: new Date('2026-08-08T00:00:00.000Z'),
  positions: [
    {
      id: SUPPLY_POS,
      position: 1,
      assortmentKind: 'product',
      assortmentId: PRODUCT,
      productId: PRODUCT,
      purchaseOrderPositionId: PO_POS,
      quantity: QTY,
      priceMinor: PRICE,
      discount: '0',
      vat: null,
      vatEnabled: false,
      cellId: null,
      costMinor: 0n,
      remainingQty: QTY,
      product: {
        id: PRODUCT,
        name: 'Tovar',
        code: 'T-1',
        uom: null,
        weightG: null,
        volumeML: null,
      },
    },
  ],
});

const invoiceInRow = (): Row => ({
  id: 'ii-1',
  accountId: ACC,
  name: 'СЧТ-00001',
  agentId: CP,
  organizationId: ORG,
  purchaseOrderId: PO_ID,
  currency: 'UZS',
  rateValue: 100_000_000n,
  sumMinor: SUM,
  payedSumMinor: 0n,
  vatEnabled: false,
  vatIncluded: false,
  state: 'draft',
  applicable: false,
  postedAt: null,
  deletedAt: null,
  groupId: null,
  version: 1,
  moment: new Date('2026-08-08T00:00:00.000Z'),
  positions: [],
});

const purchaseReturnRow = (): Row => ({
  id: 'pr-1',
  accountId: ACC,
  name: 'ВТ-00001',
  agentId: CP,
  organizationId: ORG,
  storeId: STORE,
  supplyId: 'sup-1',
  supply: { id: 'sup-1', name: 'ПРМ-00001', state: 'posted', purchaseOrderId: PO_ID },
  currency: 'UZS',
  rateValue: 100_000_000n,
  sumMinor: SUM,
  vatSumMinor: 0n,
  vatEnabled: false,
  vatIncluded: false,
  state: 'draft',
  applicable: false,
  postedAt: null,
  deletedAt: null,
  groupId: null,
  moment: new Date('2026-08-09T00:00:00.000Z'),
  positions: [
    {
      id: 'prp-1',
      position: 1,
      assortmentKind: 'product',
      assortmentId: PRODUCT,
      productId: PRODUCT,
      supplyPositionId: SUPPLY_POS,
      quantity: QTY,
      priceMinor: PRICE,
      discount: '0',
      vat: null,
      vatEnabled: false,
      cellId: null,
      costMinor: PRICE,
      product: { id: PRODUCT, name: 'Tovar', code: 'T-1', uom: null },
    },
  ],
});

/**
 * Uchala servis (Qabul · Hisob-faktura · Qaytarish) BITTA daftar va BITTA
 * prisma-dubli ustida — «bir xarid, uchta hujjat» oqimini aynan shunday
 * o'lchash mumkin.
 */
function makeWorld() {
  const ledger = makeLedger();
  const rows = {
    supply: supplyRow(),
    invoiceIn: invoiceInRow(),
    purchaseReturn: purchaseReturnRow(),
  };
  const delegates = {
    supply: docDelegate(rows.supply),
    invoiceIn: docDelegate(rows.invoiceIn),
    purchaseReturn: docDelegate(rows.purchaseReturn),
  };

  const client: Record<string, unknown> = {
    supply: delegates.supply,
    invoiceIn: delegates.invoiceIn,
    purchaseReturn: delegates.purchaseReturn,
    supplyPosition: {
      findMany: vi.fn(async () => [
        { id: SUPPLY_POS, quantity: QTY, purchaseOrderPositionId: PO_POS },
      ]),
      update: vi.fn(async () => ({})),
    },
    // Boshqa POSTED qaytarish yo'q ⇒ kümülativ cheklov to'liq qaytarishga ruxsat beradi.
    purchaseReturnPosition: {
      groupBy: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
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
    assertAvailable: vi.fn(() => undefined),
  };
  const po = {
    applyReceipt: vi.fn(async () => undefined),
    applyInvoice: vi.fn(async () => undefined),
  };
  const webhookFire = { fireForEvent: vi.fn() };
  const events = { emit: vi.fn() };
  const prisma = { client } as never;

  const supply = new SupplyService(
    prisma,
    stock as never,
    po as never,
    {} as never, // paymentOut
    {} as never, // purchaseReturns
    {} as never, // attrs
    webhookFire as never,
    events as never,
    ledger.balance as never,
    { require: vi.fn(async () => 'ALL') } as never, // permissions (Faza 14)
  );
  const invoiceIn = new InvoiceInService(
    prisma,
    po as never,
    {} as never, // paymentOut
    {} as never, // attrs
    webhookFire as never,
  );
  const purchaseReturn = new PurchaseReturnService(
    prisma,
    stock as never,
    po as never,
    {} as never, // attrs
    webhookFire as never,
    ledger.balance as never,
  );

  return { ledger, rows, svc: { supply, invoiceIn, purchaseReturn }, po, stock };
}

describe('Taminotchi qarzi — SUPPLY-ONLY (PP-03)', () => {
  it('InvoiceIn post() kontragent balansiga TEGMAYDI', async () => {
    const { ledger, svc } = makeWorld();

    await svc.invoiceIn.transition(ACC, USER, 'ii-1', 'post');

    expect(ledger.balance.applyDelta).not.toHaveBeenCalled();
    expect(ledger.balanceOf()).toBe(0n);
  });

  it("InvoiceIn balansdan uzilsa ham PO «invoicedSum» kaskadi ISHLAYDI (hujjat o'lmadi)", async () => {
    const { svc, po } = makeWorld();

    await svc.invoiceIn.transition(ACC, USER, 'ii-1', 'post');

    expect(po.applyInvoice).toHaveBeenCalledTimes(1);
  });

  it('InvoiceIn post → unpost sikli daftarda umuman iz qoldirmaydi', async () => {
    const { ledger, svc } = makeWorld();

    await svc.invoiceIn.transition(ACC, USER, 'ii-1', 'post');
    await svc.invoiceIn.transition(ACC, USER, 'ii-1', 'unpost');

    expect(ledger.deltas).toEqual([]);
    expect(ledger.balanceOf()).toBe(0n);
  });

  it('PO → Supply + InvoiceIn oqimida qarz FAQAT BIR MARTA (Supply summasi)', async () => {
    const { ledger, svc } = makeWorld();

    await svc.supply.transition(ACC, USER, 'sup-1', 'post');
    await svc.invoiceIn.transition(ACC, USER, 'ii-1', 'post');

    expect(ledger.deltas).toEqual([{ deltaMinor: -SUM, docType: 'supply', docId: 'sup-1' }]);
    expect(ledger.balanceOf()).toBe(-SUM);
  });
});

describe('Taminotchiga qaytarish — balans simmetriyasi (PP-02)', () => {
  it("to'liq qaytarish qabul yozgan qarzni AYNAN nolga tushiradi", async () => {
    const { ledger, svc } = makeWorld();

    await svc.supply.transition(ACC, USER, 'sup-1', 'post');
    expect(ledger.balanceOf()).toBe(-SUM);

    await svc.purchaseReturn.transition(ACC, USER, 'pr-1', 'post');

    expect(ledger.balanceOf()).toBe(0n);
    expect(ledger.deltas.map((d) => d.deltaMinor)).toEqual([-SUM, SUM]);
  });

  it("qaytarish deltasi o'z hujjatiga havola bilan yoziladi (akt qatorida topilsin)", async () => {
    const { ledger, svc } = makeWorld();

    await svc.purchaseReturn.transition(ACC, USER, 'pr-1', 'post');

    expect(ledger.deltas).toEqual([{ deltaMinor: SUM, docType: 'purchaseReturn', docId: 'pr-1' }]);
  });

  it("qaytarishni unpost qilish qarzni QAYTA tiklaydi (post bilan nol-yig'indi)", async () => {
    const { ledger, svc } = makeWorld();

    await svc.supply.transition(ACC, USER, 'sup-1', 'post');
    await svc.purchaseReturn.transition(ACC, USER, 'pr-1', 'post');
    await svc.purchaseReturn.transition(ACC, USER, 'pr-1', 'unpost');

    expect(ledger.balanceOf()).toBe(-SUM);
    expect(ledger.deltas.map((d) => d.deltaMinor)).toEqual([-SUM, SUM, -SUM]);
  });

  it("o'tkazilgan qaytarishni cancel qilish ham deltani qaytaradi", async () => {
    const { ledger, svc } = makeWorld();

    await svc.supply.transition(ACC, USER, 'sup-1', 'post');
    await svc.purchaseReturn.transition(ACC, USER, 'pr-1', 'post');
    await svc.purchaseReturn.transition(ACC, USER, 'pr-1', 'cancel');

    expect(ledger.balanceOf()).toBe(-SUM);
    expect(ledger.deltas.map((d) => d.deltaMinor)).toEqual([-SUM, SUM, -SUM]);
  });

  it('draft qaytarishni cancel qilish balansga TEGMAYDI (applicable emas)', async () => {
    const { ledger, svc } = makeWorld();

    await svc.purchaseReturn.transition(ACC, USER, 'pr-1', 'cancel');

    expect(ledger.deltas).toEqual([]);
  });
});
