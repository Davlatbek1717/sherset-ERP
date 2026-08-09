import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { materializeComment } from '../comments/comment-templates.js';
import { ManagerQueueService } from './manager-queue.service.js';
import { WORK_ITEM_ACTION as ACT, WORK_ITEM_STATUS as ST } from './work-item-fsm.js';

/**
 * MK06 — navbat servisi: bazasiz ULANISH testlari.
 *
 * Sof qoidalar allaqachon qulflangan (`work-item-rules` 21 · `work-queue-planner`
 * 16 · `work-item-fsm` 20). Bu yerda faqat mock'siz chiqarib bo'lmaydigan
 * shartnomalar:
 *   1. 🔴 dvigatel element O'CHIRMAYDI;
 *   2. 🔴 dedup baza darajasida ham kafolatlangan (`skipDuplicates`);
 *   3. yopish sabab kodini SAQLAYDI va jurnalga yozadi;
 *   4. parallel menejer 409 oladi (jimgina ustidan yozish yo'q);
 *   5. birligi mos kelmagan chegara sozlamasi RAD etiladi.
 */

const ACC = 'acc-1';
const MANAGER = { actor: 'manager' as const, actorId: 'mgr-1' };

function makeClient(over: Record<string, unknown> = {}) {
  const managerWorkItem = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    groupBy: vi.fn().mockResolvedValue([]),
  };
  const managerWorkItemEvent = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({ id: 'ev-1' }),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const client = {
    managerRuleConfig: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    cashierSessionVariance: { findMany: vi.fn().mockResolvedValue([]) },
    // MK07 manbalari — 12 qoida shulardan o'qiydi.
    cashierAuditEvent: { findMany: vi.fn().mockResolvedValue([]) },
    debt: { findMany: vi.fn().mockResolvedValue([]) },
    hrAttendance: { findMany: vi.fn().mockResolvedValue([]) },
    employee: { findMany: vi.fn().mockResolvedValue([]) },
    restockTask: { findMany: vi.fn().mockResolvedValue([]) },
    inventory: { findMany: vi.fn().mockResolvedValue([]) },
    managerWorkItem,
    managerWorkItemEvent,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ managerWorkItem, managerWorkItemEvent }),
    ),
    ...over,
  };
  // Zaxira signallari MAVJUD moduldan keladi (`manager-inventory`) — navbat
  // o'sha hisobni takrorlamaydi.
  const inventoryService = { stockSignalRows: vi.fn().mockResolvedValue({ rows: [] }) };
  // MK20 — shablon servisi: bu yerda shablonsiz yo'l sinaladi, shuning uchun
  // HAQIQIY sof funksiya bilan dublyor (matn kesish/`null` xulqi bir xil
  // qolsin). Shablonli yo'l `comments/comment-template-wiring.test.ts` da.
  const commentTemplates = {
    resolveComment: vi.fn(async (_acc: string, input: { comment?: string }) =>
      materializeComment({ comment: input.comment }),
    ),
  };
  const service = new ManagerQueueService(
    { client } as never,
    inventoryService as never,
    commentTemplates as never,
  );
  return { service, client, managerWorkItem, managerWorkItemEvent, inventoryService };
}

const variance = (over = {}) => ({
  id: 'var-1',
  sessionId: 'sess-1',
  cashierId: 'emp-9',
  currency: 'UZS',
  varianceMinor: -250_000n,
  kind: 'shortage',
  createdAt: new Date('2026-08-08T18:00:00Z'),
  acknowledgedAt: null,
  ...over,
});

// ── 🔴 Dvigatel o'chirmaydi ─────────────────────────────────────────────────

describe('🔴 sync element O`CHIRMAYDI (§5.1)', () => {
  it('Prisma `delete`/`deleteMany` UMUMAN chaqirilmaydi', async () => {
    const { service, managerWorkItem, managerWorkItemEvent } = makeClient();
    const del = vi.fn();
    Object.assign(managerWorkItem, { delete: del, deleteMany: del });
    Object.assign(managerWorkItemEvent, { delete: del, deleteMany: del });

    await service.sync(ACC, {});

    expect(del).not.toHaveBeenCalled();
  });

  it('eskirgan element faqat BELGILANADI (`staleAt` yoziladi, holat tegilmaydi)', async () => {
    const { service, managerWorkItem } = makeClient();
    managerWorkItem.findMany.mockResolvedValue([
      {
        id: 'wi-old',
        dedupKey: 'k1',
        status: ST.open,
        staleAt: null,
        statusChangedAt: new Date(Date.now() - 30 * 86_400_000),
      },
    ]);

    await service.sync(ACC, {});

    const call = managerWorkItem.updateMany.mock.calls[0]?.[0];
    expect(call.data).toHaveProperty('staleAt');
    expect(call.data).not.toHaveProperty('status');
    // Takror belgilamaslik sharti so'rovda ham bor.
    expect(call.where.staleAt).toBeNull();
  });
});

// ── 🔴 Dedup ────────────────────────────────────────────────────────────────

describe('🔴 dedup baza darajasida ham kafolatlangan', () => {
  it('`createMany` `skipDuplicates: true` bilan chaqiriladi (parallel sync poygasi)', async () => {
    const { service, client, managerWorkItem } = makeClient();
    client.cashierSessionVariance.findMany.mockResolvedValue([variance()]);

    const result = await service.sync(ACC, {});

    expect(managerWorkItem.createMany).toHaveBeenCalledTimes(1);
    expect(managerWorkItem.createMany.mock.calls[0]?.[0].skipDuplicates).toBe(true);
    expect(result.candidates).toBe(1);
  });

  it('mavjud kalit ikkinchi marta yozilmaydi', async () => {
    const { service, client, managerWorkItem } = makeClient();
    client.cashierSessionVariance.findMany.mockResolvedValue([variance()]);
    managerWorkItem.findMany.mockResolvedValue([
      {
        id: 'wi-1',
        dedupKey: 'cash_variance:var-1',
        status: ST.resolved,
        staleAt: null,
        statusChangedAt: new Date(),
      },
    ]);

    const result = await service.sync(ACC, {});

    expect(managerWorkItem.createMany).not.toHaveBeenCalled();
    expect(result.duplicates).toBe(1);
    expect(result.created).toBe(0);
  });
});

// ── Harakat ─────────────────────────────────────────────────────────────────

describe('harakat — §5.3 sabab saqlanadi', () => {
  const withItem = (status: string = ST.open) => {
    const made = makeClient();
    made.managerWorkItem.findFirst.mockResolvedValue({ id: 'wi-1', status });
    return made;
  };

  it('tasdiqlash sabab kodi va izohni SAQLAYDI + jurnalga yozadi', async () => {
    const { service, managerWorkItem, managerWorkItemEvent } = withItem();

    const res = await service.act(ACC, MANAGER, 'wi-1', {
      action: ACT.acknowledge,
      reasonCode: 'justified',
      comment: 'raqobatchi narxi',
    });

    expect(res).toMatchObject({ ok: true, status: ST.resolved, noop: false });
    const update = managerWorkItem.updateMany.mock.calls[0]?.[0];
    expect(update.data.resolutionCode).toBe('justified');
    expect(update.data.resolvedById).toBe('mgr-1');
    // Optimistik da'vo: FAQAT kutilgan holatdan.
    expect(update.where.status).toBe(ST.open);

    const event = managerWorkItemEvent.create.mock.calls[0]?.[0].data;
    expect(event).toMatchObject({
      fromStatus: ST.open,
      toStatus: ST.resolved,
      action: ACT.acknowledge,
      reasonCode: 'justified',
    });
  });

  it('🔴 parallel menejer 409 oladi (0 qator yangilandi)', async () => {
    const { service, managerWorkItem } = withItem();
    managerWorkItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.act(ACC, MANAGER, 'wi-1', { action: ACT.acknowledge, reasonCode: 'justified' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('takror bosish NO-OP — na yozuv, na jurnal', async () => {
    const { service, managerWorkItem, managerWorkItemEvent } = withItem(ST.resolved);

    const res = await service.act(ACC, MANAGER, 'wi-1', {
      action: ACT.acknowledge,
      reasonCode: 'justified',
    });

    expect(res.noop).toBe(true);
    expect(managerWorkItem.updateMany).not.toHaveBeenCalled();
    expect(managerWorkItemEvent.create).not.toHaveBeenCalled();
  });

  it('sababsiz yopish 400 (§5.3)', async () => {
    const { service } = withItem();
    await expect(
      service.act(ACC, MANAGER, 'wi-1', { action: ACT.acknowledge }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('noqonuniy o`tish 409', async () => {
    const { service } = withItem(ST.dismissed);
    await expect(
      service.act(ACC, MANAGER, 'wi-1', { action: ACT.requestExplanation }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('begona akkаuntning elementi topilmaydi', async () => {
    const { service, managerWorkItem } = makeClient();
    managerWorkItem.findFirst.mockResolvedValue(null);
    await expect(
      service.act(ACC, MANAGER, 'wi-x', { action: ACT.acknowledge, reasonCode: 'justified' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('qayta ochish eskirish belgisini TOZALAYDI — sanoq noldan', async () => {
    const { service, managerWorkItem } = makeClient();
    managerWorkItem.findFirst.mockResolvedValue({ id: 'wi-1', status: ST.resolved });

    await service.act(ACC, MANAGER, 'wi-1', {
      action: ACT.reopen,
      reasonCode: 'new_evidence',
    });

    expect(managerWorkItem.updateMany.mock.calls[0]?.[0].data.staleAt).toBeNull();
  });
});

// ── Qoida sozlamasi ─────────────────────────────────────────────────────────

describe('qoida sozlamasi', () => {
  it('🔴 birligi MOS KELMAGAN chegara RAD etiladi (jimgina saqlanmaydi)', async () => {
    const { service, client } = makeClient();
    await expect(
      service.updateRule(ACC, 'mgr-1', 'PRICE_CHANGE', {
        thresholdValue: 5000,
        thresholdUnit: 'minor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.managerRuleConfig.upsert).not.toHaveBeenCalled();
  });

  it('mos birlikdagi chegara saqlanadi', async () => {
    const { service, client } = makeClient();
    await service.updateRule(ACC, 'mgr-1', 'PRICE_CHANGE', {
      thresholdValue: 35,
      thresholdUnit: 'percent',
    });
    expect(client.managerRuleConfig.upsert).toHaveBeenCalledTimes(1);
  });

  it('notanish qoida turi 404', async () => {
    const { service } = makeClient();
    await expect(
      service.updateRule(ACC, 'mgr-1', 'NO_SUCH_RULE', { enabled: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o`chirilgan qoida `sync` da manbani UMUMAN o`qimaydi', async () => {
    const { service, client } = makeClient();
    client.managerRuleConfig.findMany.mockResolvedValue([
      {
        ruleType: 'CASH_VARIANCE',
        enabled: false,
        thresholdValue: null,
        thresholdUnit: null,
        mode: 'notify',
        severity: 'warning',
      },
    ]);

    await service.sync(ACC, {});

    expect(client.cashierSessionVariance.findMany).not.toHaveBeenCalled();
  });
});

// ── Ro'yxat ─────────────────────────────────────────────────────────────────

describe('ro`yxat', () => {
  it('BigInt satrga aylanadi, `null` esa `null` bo`lib qoladi (NULL ≠ 0)', async () => {
    const { service, managerWorkItem } = makeClient();
    managerWorkItem.findMany.mockResolvedValue([
      {
        id: 'wi-1',
        ruleType: 'CASH_VARIANCE',
        dedupKey: 'k',
        status: ST.open,
        severity: 'critical',
        subjectEmployeeId: 'emp-9',
        amountMinor: -250_000n,
        currency: 'UZS',
        docType: 'cashiersession',
        docId: 'sess-1',
        occurredAt: new Date('2026-08-08T18:00:00Z'),
        context: {},
        staleAt: null,
        resolutionCode: null,
        resolvedAt: null,
        subject: { id: 'emp-9', name: 'Vali' },
        resolvedBy: null,
      },
      {
        id: 'wi-2',
        ruleType: 'PRICE_CHANGE',
        dedupKey: 'k2',
        status: ST.open,
        severity: 'warning',
        subjectEmployeeId: null,
        amountMinor: null,
        currency: null,
        docType: 'product',
        docId: 'p-1',
        occurredAt: new Date('2026-08-07T10:00:00Z'),
        context: {},
        staleAt: null,
        resolutionCode: null,
        resolvedAt: null,
        subject: null,
        resolvedBy: null,
      },
    ]);

    const res = await service.list(ACC, {});

    expect(res.rows[0]?.amountMinor).toBe('-250000');
    expect(res.rows[1]?.amountMinor).toBeNull();
    // Ekran tugmalarini FSM chizadi, sahifa o'z shartini yozmaydi.
    expect(res.rows[0]?.allowedActions).toContain(ACT.acknowledge);
  });

  it('eskirganlar soni alohida qaytadi (§5.1 diqqat o`lchovi)', async () => {
    const { service, managerWorkItem } = makeClient();
    managerWorkItem.findMany.mockResolvedValue([
      {
        id: 'wi-1',
        ruleType: 'CASH_VARIANCE',
        dedupKey: 'k',
        status: ST.open,
        severity: 'info',
        subjectEmployeeId: null,
        amountMinor: null,
        currency: null,
        docType: null,
        docId: null,
        occurredAt: new Date('2026-08-01T00:00:00Z'),
        context: {},
        staleAt: new Date('2026-08-05T00:00:00Z'),
        resolutionCode: null,
        resolvedAt: null,
        subject: null,
        resolvedBy: null,
      },
    ]);

    const res = await service.list(ACC, {});
    expect(res.staleCount).toBe(1);
  });
});

// ── MK07: 12 qoida manbaga ulandi ──────────────────────────────────────────

describe('MK07 — har qoida O`Z manbasidan o`qiydi', () => {
  it('sync barcha manbalarni bir yugurishda o`qiydi', async () => {
    const { service, client, inventoryService } = makeClient();

    await service.sync(ACC, {});

    // Sotuv qoidalari (BELOW_COST / BIG_DISCOUNT / BELOW_WHOLESALE /
    // SHIFT_OUT_OF_SCHEDULE) — BITTA so'rov, to'rt hodisa turi.
    expect(client.cashierAuditEvent.findMany).toHaveBeenCalledTimes(1);
    expect(client.debt.findMany).toHaveBeenCalledTimes(1);
    expect(client.hrAttendance.findMany).toHaveBeenCalled();
    expect(client.restockTask.findMany).toHaveBeenCalledTimes(1);
    expect(client.inventory.findMany).toHaveBeenCalledTimes(1);
    // Zaxira — mavjud dvigatel (nusxa emas).
    expect(inventoryService.stockSignalRows).toHaveBeenCalledTimes(1);
  });

  it('kassa audit hodisasi navbat elementiga aylanadi (BELOW_COST)', async () => {
    const { service, client, managerWorkItem } = makeClient();
    client.cashierAuditEvent.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        employeeId: 'emp-1',
        sessionId: 'ses-1',
        type: 'SOLD_BELOW_COST',
        docId: 'sale-1',
        payload: { productId: 'p-1', lossMinor: '150000' },
        createdAt: new Date('2026-08-08T09:00:00Z'),
      },
    ]);

    const result = await service.sync(ACC, {});

    expect(result.candidates).toBe(1);
    const created = managerWorkItem.createMany.mock.calls[0]?.[0].data;
    expect(created[0]).toMatchObject({ ruleType: 'BELOW_COST', dedupKey: 'below_cost:ev-1' });
  });

  it('🔴 o`chirilgan qarz qoidalari qarz jadvalini UMUMAN o`qimaydi', async () => {
    const { service, client } = makeClient();
    client.managerRuleConfig.findMany.mockResolvedValue(
      ['BIG_DEBT', 'OVERDUE_DEBT'].map((ruleType) => ({
        ruleType,
        enabled: false,
        thresholdValue: null,
        thresholdUnit: null,
        mode: 'notify',
        severity: 'warning',
      })),
    );

    await service.sync(ACC, {});

    expect(client.debt.findMany).not.toHaveBeenCalled();
  });

  it('zaxira chegaralari SOZLAMADAN uzatiladi (ikkinchi haqiqat yo`q)', async () => {
    const { service, client, inventoryService } = makeClient();
    client.managerRuleConfig.findMany.mockResolvedValue([
      {
        ruleType: 'DEAD_STOCK',
        enabled: true,
        thresholdValue: '150',
        thresholdUnit: 'days',
        mode: 'notify',
        severity: 'info',
      },
    ]);

    await service.sync(ACC, {});

    expect(inventoryService.stockSignalRows.mock.calls[0]?.[1].thresholds.deadDays).toBe(150);
  });
});

// ── MK07 §5.3: sabab kodi qoidaga bog'landi ────────────────────────────────

describe('MK07 §5.3 — yopishda qoidaning sabab kodi', () => {
  function withRuledItem(ruleType: string) {
    const made = makeClient();
    made.managerWorkItem.findFirst.mockResolvedValue({
      id: 'wi-1',
      status: ST.open,
      ruleType,
    });
    return made;
  }

  it('qoidaning kodi bilan yopiladi va SAQLANADI', async () => {
    const { service, managerWorkItem } = withRuledItem('BELOW_COST');

    await service.act(ACC, MANAGER, 'wi-1', {
      action: ACT.acknowledge,
      reasonCode: 'competitor_price',
    });

    expect(managerWorkItem.updateMany.mock.calls[0]?.[0].data.resolutionCode).toBe(
      'competitor_price',
    );
  });

  it('🔴 BOSHQA qoidaning kodi 400 (statistika aralashmaydi)', async () => {
    const { service } = withRuledItem('BELOW_COST');

    await expect(
      service.act(ACC, MANAGER, 'wi-1', { action: ACT.acknowledge, reasonCode: 'sick_leave' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('umumiy kod hamon ishlaydi (MK06 regressiyasi yo`q)', async () => {
    const { service } = withRuledItem('BELOW_COST');
    const res = await service.act(ACC, MANAGER, 'wi-1', {
      action: ACT.acknowledge,
      reasonCode: 'justified',
    });
    expect(res.ok).toBe(true);
  });
});

describe('MK07 — ro`yxat sabab kodlarini O`ZI beradi', () => {
  it('har qator o`z qoidasining kodlarini olib keladi (FE nusxa saqlamaydi)', async () => {
    const { service, managerWorkItem } = makeClient();
    managerWorkItem.findMany.mockResolvedValue([
      {
        id: 'wi-1',
        ruleType: 'ABSENT',
        dedupKey: 'k',
        status: ST.open,
        severity: 'warning',
        subjectEmployeeId: 'emp-4',
        amountMinor: null,
        currency: null,
        docType: null,
        docId: null,
        occurredAt: new Date('2026-08-07T00:00:00Z'),
        context: {},
        staleAt: null,
        resolutionCode: null,
        resolvedAt: null,
        subject: null,
        resolvedBy: null,
      },
    ]);

    const res = await service.list(ACC, {});

    const codes = res.rows[0]?.reasonCodes;
    expect(codes?.[ACT.acknowledge]).toContain('sick_leave');
    expect(codes?.[ACT.acknowledge]).not.toContain('competitor_price');
    // Yopuvchi boshqa amallar umumiy katalogda qoladi.
    expect(codes?.[ACT.dismiss]).toContain('false_positive');
  });
});
