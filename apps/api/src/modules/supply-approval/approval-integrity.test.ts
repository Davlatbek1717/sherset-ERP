import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SupplyService } from '../supply/supply.service.js';
import { SupplyApprovalService } from './supply-approval.service.js';

/**
 * Faza 14 — `PP-06` (FSM-bypass) + `PP-04` (omborchi tuzatishi summalarni
 * qayta hisoblamaydi). Ikkala nosozlik ham SHU faylda qulflanadi.
 *
 * `PP-06` (HIGH security) — 3 tirqish:
 *   (a) `supply.post()` `approvalStage`ni UMUMAN tekshirmasdi ⇒
 *       `POST /supplies/:id/transitions/post` `awaiting_supplier` bosqichida ham
 *       stockni kirgizardi va FSM o'sha bosqichda qotib qolardi (tovar omborda,
 *       tasdiq zanjiri esa hech qachon tugamaydi).
 *   (b) `POST /supplies` faqat `supply.create` ruxsatini talab qiladi, servis esa
 *       `applicable:true` bo'lsa ichkarida `transition('post')` chaqiradi — ya'ni
 *       `supply.approve` ruxsatisiz xodim «Проведено» belgilab tasdiqsiz stock
 *       kirgizardi (controller darajasidagi `approve` gate'i chetlab o'tilardi).
 *   (c) Zanjir UCHIB TURGANDA (`awaiting_supplier|delivering|awaiting_admin`)
 *       hujjat `draft`+`applicable:false` bo'lgani uchun `update()`/`delete()`
 *       ochiq edi — omborchi sanaganidan keyin admin tasdig'igacha sonlar
 *       sezdirmasdan o'zgartirilishi (yoki hujjat o'chirilishi) mumkin edi.
 *
 * `PP-04` (HIGH data-integrity) — `omborchiConfirm` faqat
 *   `supplyPosition.quantity`ni yozardi; `sumMinor/vatSumMinor/costSumMinor`
 *   qayta hisoblanmasdi. Keyin `adminConfirm → post()` stock deltalarini YANGI
 *   sondan (90), taminotchi qarzini esa ESKI `existing.sumMinor`dan (100 donalik
 *   summa) yozardi ⇒ har tuzatilgan qabulda pul-tovar nomuvofiqligi.
 *
 * NON-VACUOUS (fix'dan OLDIN o'lchangan — pastdagi «oldin:» izohlari).
 */

const ACC = 'acc-1';
const USER = 'usr-1';
const SUPPLY_ID = '11111111-1111-4111-8111-111111111111';
const POS_ID = '22222222-2222-4222-8222-222222222222';
const CP = '33333333-3333-4333-8333-333333333333';
const ORG = '44444444-4444-4444-8444-444444444444';
const STORE = '55555555-5555-4555-8555-555555555555';
const PRODUCT = '66666666-6666-4666-8666-666666666666';

/** 100 dona × 400 000.00 so'm = 40 000 000 tiyin. Omborchi 90 sanaydi ⇒ 36 000 000. */
const PRICE = 400_000n;
const SUM_100 = 40_000_000n;
const SUM_90 = 36_000_000n;

type Row = Record<string, unknown> & { id: string; accountId: string };

/** Kontragent bosh daftari — qarz deltalari shu yerga tushadi. */
function makeLedger() {
  const deltas: bigint[] = [];
  const balance = {
    applyDelta: vi.fn(
      async (
        _tx: unknown,
        _accountId: string,
        _counterpartyId: string,
        _currency: string,
        deltaMinor: bigint,
      ) => {
        deltas.push(deltaMinor);
      },
    ),
  };
  return { balance, deltas };
}

/**
 * Prisma dubli — `updateMany` WHERE'dagi SKALYAR shartlarni (`state`,
 * `approvalStage`, `applicable`, `deletedAt`) va `{in:[…]}` / `{notIn:[…]}`
 * shakllarini HURMAT QILADI: atomik claim'lar aynan shu shartlarga tayanadi.
 */
function whereMatches(where: Record<string, unknown>, row: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const actual = row[key];
    if (cond === null || typeof cond !== 'object') {
      if (actual !== cond) return false;
      continue;
    }
    const c = cond as { in?: unknown[]; notIn?: unknown[] };
    if (Array.isArray(c.in) && !c.in.includes(actual)) return false;
    if (Array.isArray(c.notIn) && c.notIn.includes(actual)) return false;
  }
  return true;
}

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
    create: vi.fn(async () => snap()),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => {
      Object.assign(row, args.data);
      return snap();
    }),
    updateMany: vi.fn(
      async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!whereMatches(args.where, row)) return { count: 0 };
        Object.assign(row, args.data);
        return { count: 1 };
      },
    ),
  };
}

interface WorldOpts {
  approvalStage?: string;
  state?: string;
  quantity?: string;
}

function supplyRow(opts: WorldOpts): Row {
  return {
    id: SUPPLY_ID,
    accountId: ACC,
    name: 'ПРМ-00001',
    agentId: CP,
    organizationId: ORG,
    storeId: STORE,
    purchaseOrderId: null,
    currency: 'UZS',
    rateValue: 100_000_000n,
    sumMinor: SUM_100,
    vatSumMinor: 0n,
    costSumMinor: SUM_100,
    overheadSumMinor: 0n,
    overheadDistribution: 'WEIGHT',
    vatEnabled: false,
    vatIncluded: false,
    state: opts.state ?? 'draft',
    applicable: false,
    approvalStage: opts.approvalStage ?? 'none',
    postedAt: null,
    deletedAt: null,
    groupId: null,
    version: 1,
    moment: new Date('2026-08-08T00:00:00.000Z'),
    positions: [
      {
        id: POS_ID,
        position: 1,
        assortmentKind: 'product',
        assortmentId: PRODUCT,
        productId: PRODUCT,
        purchaseOrderPositionId: null,
        quantity: opts.quantity ?? '100',
        priceMinor: PRICE,
        discount: '0',
        vat: null,
        vatEnabled: false,
        cellId: null,
        costMinor: 0n,
        remainingQty: '0',
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
  };
}

function makeWorld(opts: WorldOpts = {}) {
  const ledger = makeLedger();
  const row = supplyRow(opts);
  const supplyDelegate = docDelegate(row);
  const positions = row.positions as Array<Record<string, unknown>>;

  const client: Record<string, unknown> = {
    supply: supplyDelegate,
    supplyPosition: {
      findMany: vi.fn(async () => positions.map((p) => ({ ...p }))),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const p = positions.find((x) => x.id === args.where.id);
        if (p) Object.assign(p, args.data);
        return { ...p };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    supplyApprovalEvent: {
      create: vi.fn(async () => ({ id: 'ev-1' })),
      findMany: vi.fn(async () => []),
    },
    store: { findFirst: vi.fn(async () => ({ id: STORE, allowNegativeStock: false })) },
    group: { findFirst: vi.fn(async () => null) },
    auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));

  const stock = {
    applyDeltas: vi.fn(async () => undefined),
    assertCellsInStore: vi.fn(async () => undefined),
  };
  const webhookFire = { fireForEvent: vi.fn() };
  const events = { emit: vi.fn() };
  const permissions = { require: vi.fn(async () => 'ALL' as const) };
  const prisma = { client } as never;

  const supply = new SupplyService(
    prisma,
    stock as never,
    {} as never, // po
    {} as never, // paymentOut
    {} as never, // purchaseReturns
    {} as never, // attrs
    webhookFire as never,
    events as never,
    ledger.balance as never,
    permissions as never,
  );
  const approval = new SupplyApprovalService(prisma, supply);

  return { row, client, ledger, stock, permissions, supply, approval, supplyDelegate };
}

describe("PP-06 — tasdiq zanjiri chetlab o'tilmaydi", () => {
  // oldin: post() approvalStage'ni ko'rmasdi ⇒ o'tib ketardi va stock kirardi.
  it("awaiting_supplier bosqichida to'g'ridan-to'g'ri post RAD etiladi", async () => {
    const { supply, stock, ledger } = makeWorld({ approvalStage: 'awaiting_supplier' });

    await expect(supply.transition(ACC, USER, SUPPLY_ID, 'post')).rejects.toThrow(/tasdiq/i);

    expect(stock.applyDeltas).not.toHaveBeenCalled();
    expect(ledger.balance.applyDelta).not.toHaveBeenCalled();
  });

  it('delivering va awaiting_admin bosqichlarida ham post RAD etiladi', async () => {
    for (const stage of ['delivering', 'awaiting_admin']) {
      const { supply, stock } = makeWorld({ approvalStage: stage });
      await expect(supply.transition(ACC, USER, SUPPLY_ID, 'post')).rejects.toThrow(/tasdiq/i);
      expect(stock.applyDeltas).not.toHaveBeenCalled();
    }
  });

  it("zanjir tegmagan (none) va tugagan (completed) qabul odatdagidek o'tkaziladi", async () => {
    for (const stage of ['none', 'completed']) {
      const { supply, stock, row } = makeWorld({ approvalStage: stage });
      await supply.transition(ACC, USER, SUPPLY_ID, 'post');
      expect(stock.applyDeltas).toHaveBeenCalledTimes(1);
      expect(row.state).toBe('posted');
    }
  });

  // oldin: create() ichidagi transition('post') hech qanday ruxsat so'ramasdi.
  it('create(applicable:true) `supply.approve` ruxsatisiz RAD etiladi — hujjat ham yaratilmaydi', async () => {
    const { supply, permissions, supplyDelegate } = makeWorld();
    permissions.require.mockRejectedValueOnce(new ForbiddenException("Ruxsat yo'q"));

    await expect(
      supply.create(ACC, USER, {
        agentId: CP,
        organizationId: ORG,
        storeId: STORE,
        vatEnabled: false,
        applicable: true,
        positions: [
          { assortmentKind: 'product', assortmentId: PRODUCT, quantity: '1', priceMinor: '100' },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(permissions.require).toHaveBeenCalledWith(USER, 'supply', 'approve');
    expect(supplyDelegate.create).not.toHaveBeenCalled();
  });

  it("create(applicable emas) approve ruxsatini SO'RAMAYDI (oddiy qoralama)", async () => {
    const { supply, permissions } = makeWorld();

    await supply
      .create(ACC, USER, {
        agentId: CP,
        organizationId: ORG,
        storeId: STORE,
        vatEnabled: false,
        positions: [
          { assortmentKind: 'product', assortmentId: PRODUCT, quantity: '1', priceMinor: '100' },
        ],
      })
      .catch(() => undefined);

    expect(permissions.require).not.toHaveBeenCalled();
  });

  // oldin: zanjir uchib turganda hujjat draft+applicable:false ⇒ update/delete ochiq edi.
  it('zanjir uchib turganda update() RAD etiladi', async () => {
    const { supply } = makeWorld({ approvalStage: 'awaiting_admin' });

    await expect(
      supply.update(ACC, USER, SUPPLY_ID, { version: 1, description: 'sezdirmay' }),
    ).rejects.toThrow(/tasdiq/i);
  });

  it("zanjir uchib turganda delete() RAD etiladi — qator o'chmaydi", async () => {
    const { supply, row } = makeWorld({ approvalStage: 'delivering' });

    await expect(supply.delete(ACC, USER, SUPPLY_ID)).rejects.toThrow(/tasdiq/i);
    expect(row.deletedAt).toBeNull();
  });
});

describe('PP-04 — omborchi tuzatishi summalarni qayta hisoblaydi', () => {
  // oldin: sumMinor 40 000 000 bo'lib qolardi (faqat quantity yozilardi).
  it('omborchi 100 → 90 sanasa hujjat sumMinor 90 donaga qayta hisoblanadi', async () => {
    const { approval, row } = makeWorld({ approvalStage: 'delivering' });

    await approval.omborchiConfirm(ACC, USER, SUPPLY_ID, {
      adjustments: [{ positionId: POS_ID, quantity: '90' }],
    });

    expect(row.sumMinor).toBe(SUM_90);
    expect(row.costSumMinor).toBe(SUM_90);
    expect(row.approvalStage).toBe('awaiting_admin');
  });

  // oldin: qarz -40 000 000 (eski summa), stock esa 90 dona ⇒ 4 000 000 tiyin nomuvofiqlik.
  it("admin tasdig'idan keyin taminotchi qarzi SANALGAN songa mos tushadi", async () => {
    const { approval, ledger, stock, row } = makeWorld({ approvalStage: 'delivering' });

    await approval.omborchiConfirm(ACC, USER, SUPPLY_ID, {
      adjustments: [{ positionId: POS_ID, quantity: '90' }],
    });
    await approval.adminConfirm(ACC, USER, SUPPLY_ID);

    expect(ledger.deltas).toEqual([-SUM_90]);
    const deltas = stock.applyDeltas.mock.calls[0]?.[3] as Array<{ qtyDelta: string }>;
    expect(deltas[0]?.qtyDelta).toBe('90');
    expect(row.state).toBe('posted');
    expect(row.approvalStage).toBe('completed');
  });

  it('tuzatishsiz tasdiq summani buzmaydi (idempotent)', async () => {
    const { approval, row } = makeWorld({ approvalStage: 'delivering' });

    await approval.omborchiConfirm(ACC, USER, SUPPLY_ID, { adjustments: [] });

    expect(row.sumMinor).toBe(SUM_100);
    expect(row.approvalStage).toBe('awaiting_admin');
  });
});
