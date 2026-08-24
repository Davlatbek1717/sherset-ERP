import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * G2 — kontrol oqimining SIMLARI: navbat servis darajasida to'g'ri
 * filtrlanadimi, «To'liq» flip+audit+SSE'ni bir zanjirda qiladimi, tahrir
 * versiya-qulf ostida yozib REZERVNI ham kamaytiradimi, va `mark-ready`
 * endi kichik omborchi qo'lida flip qilmasligi. Sof qarorlar
 * `retail-control.test.ts` da — bu fayl ulanish uchun.
 */

const ACCOUNT = 'acc-1';
const CONTROLLER = 'katta-omborchi-1';
const KEEPER = 'kichik-omborchi-1';
const CASHIER = 'kassir-1';
const SALE_ID = 'sale-1';
const SESSION_ID = 'sess-1';
const STORE_A = 'store-a';
const P1 = '11111111-1111-4111-8111-111111111111';
const POS_A = '44444444-4444-4444-8444-444444444444';

function makeStockStub() {
  return {
    lockBalances: vi.fn().mockResolvedValue(new Map()),
    assertAvailable: vi.fn(),
    applyDeltas: vi.fn().mockResolvedValue(undefined),
    applyReservationDeltas: vi.fn().mockResolvedValue(undefined),
    releaseReservationByDoc: vi.fn().mockResolvedValue(false),
  };
}

function makeService(client: unknown, stock = makeStockStub()) {
  const notifications = { emit: vi.fn().mockResolvedValue(undefined) };
  const service = new RetailSaleService(
    { client } as never,
    stock as never,
    { applyDeltas: vi.fn().mockResolvedValue(undefined) } as never,
    { computeEarnedPoints: vi.fn(), createOperation: vi.fn() } as never,
    notifications as never,
    { applyDelta: vi.fn().mockResolvedValue(undefined) } as never,
    { applyPayment: async () => {} } as never,
  );
  return { service, notifications, stock };
}

// ─── controlQueue ───────────────────────────────────────────────────────────

describe('controlQueue — navbat filtri', () => {
  it("faqat HAMMA topshirig'i yopiq cheklar; qisman va topshiriqsizlar tushmaydi", async () => {
    const sales = [
      { id: 'all-done', name: 'CH-1', moment: new Date('2026-08-24T09:00Z') },
      { id: 'partial', name: 'CH-2', moment: new Date('2026-08-24T09:05Z') },
      { id: 'no-tasks', name: 'CH-3', moment: new Date('2026-08-24T09:10Z') },
    ];
    const tasks = [
      { sourceId: 'all-done', status: 'done', skladNo: 1, assigneeName: 'Ali' },
      { sourceId: 'all-done', status: 'done', skladNo: 2, assigneeName: 'Vali' },
      { sourceId: 'partial', status: 'done', skladNo: 1, assigneeName: 'Ali' },
      { sourceId: 'partial', status: 'pending', skladNo: 2, assigneeName: 'Vali' },
    ];
    const client = {
      retailSale: { findMany: vi.fn().mockResolvedValue(sales) },
      restockTask: { findMany: vi.fn().mockResolvedValue(tasks) },
    };
    const { service } = makeService(client);

    const res = await service.controlQueue(ACCOUNT, {});
    expect(res.items.map((i: { id: string }) => i.id)).toEqual(['all-done']);
    expect(res.items[0]?.pickingTasks).toEqual([
      { skladNo: 1, assigneeName: 'Ali', status: 'done' },
      { skladNo: 2, assigneeName: 'Vali', status: 'done' },
    ]);
    // Navbat faqat `picking` holatidan quriladi (FIFO — moment asc).
    expect(client.retailSale.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { accountId: ACCOUNT, state: 'picking' },
      orderBy: { moment: 'asc' },
    });
  });

  it("picking'da chek bo'lmasa restockTask so'ralmaydi ham", async () => {
    const client = {
      retailSale: { findMany: vi.fn().mockResolvedValue([]) },
      restockTask: { findMany: vi.fn() },
    };
    const { service } = makeService(client);
    expect(await service.controlQueue(ACCOUNT, {})).toEqual({ items: [] });
    expect(client.restockTask.findMany).not.toHaveBeenCalled();
  });
});

// ─── controlApprove ─────────────────────────────────────────────────────────

function approveHarness(opts: { state?: string; openTasks?: number; flipCount?: number } = {}) {
  const tx = {
    retailSale: { updateMany: vi.fn().mockResolvedValue({ count: opts.flipCount ?? 1 }) },
    cashierAuditEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const client = {
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE_ID,
        name: 'CH-7',
        state: opts.state ?? 'picking',
        sumMinor: 120_000n,
        sessionId: SESSION_ID,
        session: { cashierId: CASHIER },
        positions: [{ productId: P1, quantity: 2 }],
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: SALE_ID, state: 'ready' }),
    },
    restockTask: { count: vi.fn().mockResolvedValue(opts.openTasks ?? 0) },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { client, tx };
}

describe("controlApprove — «To'liq»", () => {
  it('flip + KIM tekshirgani auditi + kassirga sale_ready — bir zanjirda', async () => {
    const { client, tx } = approveHarness();
    const { service, notifications } = makeService(client);

    await service.controlApprove(ACCOUNT, CONTROLLER, SALE_ID);

    expect(tx.retailSale.updateMany).toHaveBeenCalledWith({
      where: { id: SALE_ID, accountId: ACCOUNT, state: 'picking' },
      data: { state: 'ready' },
    });
    const audit = tx.cashierAuditEvent.createMany.mock.calls[0]?.[0]?.data?.[0];
    expect(audit).toMatchObject({
      accountId: ACCOUNT,
      sessionId: SESSION_ID,
      employeeId: CONTROLLER,
      type: 'CONTROL_APPROVED',
      docId: SALE_ID,
    });
    expect(notifications.emit).toHaveBeenCalledWith(
      ACCOUNT,
      CASHIER,
      'sale_ready',
      expect.any(String),
      expect.stringContaining('CH-7'),
      'RetailSale',
      SALE_ID,
    );
  });

  it("ochiq topshiriq bor — 400 (omborchi hali yig'moqda), tx ochilmaydi", async () => {
    const { client } = approveHarness({ openTasks: 2 });
    const { service } = makeService(client);
    await expect(service.controlApprove(ACCOUNT, CONTROLLER, SALE_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("FSM: ready/draft holatidan tasdiqlab bo'lmaydi — 400", async () => {
    for (const state of ['ready', 'draft', 'posted']) {
      const { client } = approveHarness({ state });
      const { service } = makeService(client);
      await expect(service.controlApprove(ACCOUNT, CONTROLLER, SALE_ID)).rejects.toThrow(
        BadRequestException,
      );
    }
  });

  it('poyga: flip 0 qator — 409, bildirishnoma ketmaydi', async () => {
    const { client } = approveHarness({ flipCount: 0 });
    const { service, notifications } = makeService(client);
    await expect(service.controlApprove(ACCOUNT, CONTROLLER, SALE_ID)).rejects.toThrow(
      ConflictException,
    );
    expect(notifications.emit).not.toHaveBeenCalled();
  });
});

// ─── controlEdit ────────────────────────────────────────────────────────────

function editHarness(
  opts: {
    state?: string;
    flipCount?: number;
    reservations?: Array<{
      storeId: string;
      assortmentKind: string;
      assortmentId: string;
      qtyDelta: { toString(): string };
    }>;
  } = {},
) {
  const tx = {
    retailSale: { updateMany: vi.fn().mockResolvedValue({ count: opts.flipCount ?? 1 }) },
    retailSalePosition: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    stockReservation: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          opts.reservations ?? [
            { storeId: STORE_A, assortmentKind: 'product', assortmentId: P1, qtyDelta: '5' },
          ],
        ),
    },
    cashierAuditEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const client = {
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({
        id: SALE_ID,
        name: 'CH-7',
        state: opts.state ?? 'picking',
        version: 4,
        sumMinor: 250_000n,
        sessionId: SESSION_ID,
        session: { cashierId: CASHIER },
        positions: [
          {
            id: POS_A,
            productId: P1,
            quantity: 5,
            priceMinor: 50_000n,
            discount: 0,
            sumMinor: 250_000n,
            product: { name: 'Shurup 5mm' },
          },
        ],
      }),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { client, tx };
}

const EDIT_BODY = { version: 4, positions: [{ id: POS_A, quantity: '2' }] };

describe('controlEdit — tarkib tahriri', () => {
  it('versiya-qulfli yozuv: sumMinor + qator + REZERV delta + audit + SSE', async () => {
    const { client, tx } = editHarness();
    const { service, notifications, stock } = makeService(client);

    const res = await service.controlEdit(ACCOUNT, CONTROLLER, SALE_ID, EDIT_BODY);
    expect(res).toEqual({ ok: true, changed: true });

    // Flip: versiya + holat BIR filtrda (poyga bo'lsa 409).
    expect(tx.retailSale.updateMany).toHaveBeenCalledWith({
      where: { id: SALE_ID, accountId: ACCOUNT, version: 4, state: 'picking' },
      data: { sumMinor: 100_000n, version: { increment: 1 } },
    });
    expect(tx.retailSalePosition.updateMany).toHaveBeenCalledWith({
      where: { id: POS_A, accountId: ACCOUNT, retailSaleId: SALE_ID },
      data: { quantity: '2', sumMinor: 100_000n },
    });
    expect(tx.retailSalePosition.deleteMany).not.toHaveBeenCalled();

    // Rezerv: 5 → 2, ya'ni 3 dona bo'shaydi — hold turgan omborda, qulf bilan.
    expect(stock.lockBalances).toHaveBeenCalledWith(tx, ACCOUNT, STORE_A, [
      { kind: 'product', id: P1 },
    ]);
    expect(stock.applyReservationDeltas).toHaveBeenCalledWith(tx, ACCOUNT, CONTROLLER, [
      {
        storeId: STORE_A,
        assortmentKind: 'product',
        assortmentId: P1,
        qtyDelta: '-3',
        docType: 'retailsale',
        docId: SALE_ID,
        reason: 'release_manual',
      },
    ]);

    const audit = tx.cashierAuditEvent.createMany.mock.calls[0]?.[0]?.data?.[0];
    expect(audit).toMatchObject({
      employeeId: CONTROLLER,
      type: 'CONTROL_EDITED',
      docId: SALE_ID,
    });
    expect(audit?.payload).toMatchObject({
      oldSumMinor: '250000',
      newSumMinor: '100000',
    });

    expect(notifications.emit).toHaveBeenCalledWith(
      ACCOUNT,
      CASHIER,
      'sale_edited',
      expect.stringContaining('CH-7'),
      expect.stringContaining('Shurup 5mm'),
      'RetailSale',
      SALE_ID,
    );
  });

  it("bo'shatish rezerv NETidan oshmaydi (qisman yozilgan hold)", async () => {
    const h = editHarness({
      reservations: [
        { storeId: STORE_A, assortmentKind: 'product', assortmentId: P1, qtyDelta: '1' },
      ],
    });
    const { service, stock } = makeService(h.client);
    await service.controlEdit(ACCOUNT, CONTROLLER, SALE_ID, EDIT_BODY);
    // Kamayish 3, lekin hold neti 1 — faqat 1 bo'shaydi (manfiyga ketmaydi).
    expect(stock.applyReservationDeltas).toHaveBeenCalledWith(h.tx, ACCOUNT, CONTROLLER, [
      expect.objectContaining({ qtyDelta: '-1' }),
    ]);
  });

  it("rezerv umuman yozilmagan chek — bo'shatishsiz, lekin tahrir o'tadi", async () => {
    const h = editHarness({ reservations: [] });
    const { service, stock } = makeService(h.client);
    const res = await service.controlEdit(ACCOUNT, CONTROLLER, SALE_ID, EDIT_BODY);
    expect(res.changed).toBe(true);
    expect(stock.applyReservationDeltas).not.toHaveBeenCalled();
  });

  it("FSM chegarasi: ready'dan keyin tahrir yo'q — 400, tx ochilmaydi", async () => {
    for (const state of ['ready', 'draft', 'posted', 'cancelled']) {
      const { client } = editHarness({ state });
      const { service } = makeService(client);
      await expect(service.controlEdit(ACCOUNT, CONTROLLER, SALE_ID, EDIT_BODY)).rejects.toThrow(
        BadRequestException,
      );
      expect(client.$transaction).not.toHaveBeenCalled();
    }
  });

  it("ko'paytirish 400 (sof qoida servis orqali ham)", async () => {
    const { client } = editHarness();
    const { service } = makeService(client);
    await expect(
      service.controlEdit(ACCOUNT, CONTROLLER, SALE_ID, {
        version: 4,
        positions: [{ id: POS_A, quantity: '9' }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("o'zgarishsiz yuborilsa noop — yozuvsiz, SSE'siz", async () => {
    const { client } = editHarness();
    const { service, notifications } = makeService(client);
    const res = await service.controlEdit(ACCOUNT, CONTROLLER, SALE_ID, {
      version: 4,
      positions: [{ id: POS_A, quantity: '5' }],
    });
    expect(res).toEqual({ ok: true, changed: false });
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('poyga: versiya eskirgan (flip 0) — 409, SSE ketmaydi', async () => {
    const { client } = editHarness({ flipCount: 0 });
    const { service, notifications } = makeService(client);
    await expect(service.controlEdit(ACCOUNT, CONTROLLER, SALE_ID, EDIT_BODY)).rejects.toThrow(
      ConflictException,
    );
    expect(notifications.emit).not.toHaveBeenCalled();
  });
});

// ─── markReady — G2 dan keyingi xulq ────────────────────────────────────────

function markReadyHarness(opts: { myTasks: number }) {
  const client = {
    retailSale: {
      findFirst: vi.fn().mockResolvedValue({ id: SALE_ID, state: 'picking' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: SALE_ID, state: 'picking' }),
    },
    restockTask: {
      count: vi.fn().mockResolvedValue(opts.myTasks),
      updateMany: vi.fn().mockResolvedValue({ count: opts.myTasks }),
    },
  };
  return client;
}

describe("markReady — kontrol zanjiridagi yangi o'rni", () => {
  it("kichik omborchi (o'z topshirig'i bor): o'z topshiriqlari yopiladi, FLIP YO'Q — chek kontrolga", async () => {
    const client = markReadyHarness({ myTasks: 1 });
    const { service } = makeService(client);

    await service.markReady(ACCOUNT, SALE_ID, KEEPER);

    expect(client.restockTask.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ assigneeId: KEEPER }),
      data: { status: 'done' },
    });
    // 🔴 G2 mohiyati: oxirgi omborchi ham flip qilMAYDI.
    expect(client.retailSale.updateMany).not.toHaveBeenCalled();
  });

  it("topshiriqsiz chaqiruvchi (kassirning zaxira yo'li): hammasi yopiladi va flip bo'ladi", async () => {
    const client = markReadyHarness({ myTasks: 0 });
    const { service } = makeService(client);

    await service.markReady(ACCOUNT, SALE_ID, CASHIER);

    const taskWhere = client.restockTask.updateMany.mock.calls[0]?.[0]?.where;
    expect(taskWhere).not.toHaveProperty('assigneeId');
    expect(client.retailSale.updateMany).toHaveBeenCalledWith({
      where: { id: SALE_ID, accountId: ACCOUNT, state: 'picking' },
      data: { state: 'ready' },
    });
  });
});

// ─── list — omborchi assigneeId filtri ──────────────────────────────────────

describe('list — assigneeId/assigneeOpen filtri (omborchi paneli)', () => {
  function listHarness(sourceIds: string[]) {
    return {
      restockTask: {
        findMany: vi.fn().mockResolvedValue(sourceIds.map((sourceId) => ({ sourceId }))),
      },
      retailSale: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
  }

  it("assigneeId → cheklar topshiriq sourceId'lari bilan cheklanadi", async () => {
    const client = listHarness(['s1', 's2']);
    const { service } = makeService(client);
    await service.list(ACCOUNT, { state: 'picking', assigneeId: P1, assigneeOpen: 'true' });

    expect(client.restockTask.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      accountId: ACCOUNT,
      type: 'picking',
      sourceType: 'retailsale',
      assigneeId: P1,
      status: { notIn: ['done', 'cancelled'] },
    });
    expect(client.retailSale.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      id: { in: ['s1', 's2'] },
    });
  });

  it("assigneeOpen berilmasa holat filtri qo'yilmaydi (har qanday topshiriq)", async () => {
    const client = listHarness([]);
    const { service } = makeService(client);
    await service.list(ACCOUNT, { state: 'ready', assigneeId: P1 });
    expect(client.restockTask.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('status');
    // Topshiriqsiz omborchi hech nima ko'rmaydi — fail-closed.
    expect(client.retailSale.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      id: { in: [] },
    });
  });

  it("assigneeId berilmasa eski xulq — restockTask so'ralmaydi", async () => {
    const client = listHarness([]);
    const { service } = makeService(client);
    await service.list(ACCOUNT, { state: 'picking' });
    expect(client.restockTask.findMany).not.toHaveBeenCalled();
  });
});
