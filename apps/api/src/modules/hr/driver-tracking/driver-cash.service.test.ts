import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DriverCashService } from './driver-cash.service.js';

/**
 * Haydovchi naqd topshirig'i (HR TZ §7.2) — PUL YAXLITLIGI testlari.
 *
 * Bu yerdagi xavf oddiy CRUD emas: har xato kassaga tushmagan yoki ikki marta
 * tushgan pul demakdir. Shuning uchun testlar aynan shu uch holatni qulflaydi:
 *   1. e'lon qilish kassaga TEGMAYDI (pul hali haydovchining qo'lida);
 *   2. qabul qilishda ПКО aynan BIR MARTA yaratiladi (poyga bo'lsa ikkinchisi rad);
 *   3. ПКО yaratilmasa holat ORQAGA qaytadi (pul «topshirilgan» bo'lib osilmaydi).
 */

const ACCOUNT = 'acc-1';
const DRIVER = 'drv-1';
const CASHIER = 'csh-1';
const ID = 'h-1';

function makeService(opts: {
  row?: Record<string, unknown> | null;
  claimCount?: number;
  cashInFails?: boolean;
  trackingMode?: string;
}) {
  const handover = {
    findFirst: vi.fn(async () => opts.row ?? null),
    create: vi.fn(async ({ data }: { data: unknown }) => ({ id: ID, ...(data as object) })),
    updateMany: vi.fn(async () => ({ count: opts.claimCount ?? 1 })),
    update: vi.fn(async () => ({ id: ID, status: 'handed', cashInId: 'pko-1' })),
    findFirstOrThrow: vi.fn(async () => ({ id: ID, status: 'cancelled' })),
    groupBy: vi.fn(async () => []),
    findMany: vi.fn(async () => []),
  };
  const client = {
    driverCashHandover: handover,
    employee: {
      findFirst: vi.fn(async () => ({ trackingMode: opts.trackingMode ?? 'field' })),
      findMany: vi.fn(async () => []),
    },
    driverShift: { findFirst: vi.fn(async () => ({ id: 'shift-1' })) },
    driverTrip: { findFirst: vi.fn(async () => ({ id: 'trip-1' })) },
  };
  const cashIn = {
    create: vi.fn(async () => {
      if (opts.cashInFails) throw new Error('ПКО yaratilmadi');
      return { id: 'pko-1' };
    }),
    transition: vi.fn(async () => ({ id: 'pko-1', state: 'posted' })),
  };
  const svc = new DriverCashService({ client } as never, cashIn as never);
  return { svc, handover, cashIn, client };
}

describe("collect — e'lon qilish kassaga TEGMAYDI", () => {
  it("yozuv 'pending' bo'lib yaratiladi va ПКО chaqirilmaydi", async () => {
    const { svc, handover, cashIn } = makeService({});
    await svc.collect(ACCOUNT, DRIVER, { amountMinor: '500000' });
    const data = handover.create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.status).toBe('pending');
    expect(data.amountMinor).toBe(500_000n);
    // Eng muhimi: pul hali kassaga tushmaydi.
    expect(cashIn.create).not.toHaveBeenCalled();
    expect(cashIn.transition).not.toHaveBeenCalled();
  });

  it("ochiq smena bog'lanadi (yig'ma hisobot uchun)", async () => {
    const { svc, handover } = makeService({});
    await svc.collect(ACCOUNT, DRIVER, { amountMinor: '1000' });
    const data = handover.create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.shiftId).toBe('shift-1');
  });

  it('0 yoki manfiy summa rad etiladi', async () => {
    const { svc } = makeService({});
    await expect(svc.collect(ACCOUNT, DRIVER, { amountMinor: '0' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("haydovchi bo'lmagan xodim yoza olmaydi", async () => {
    const { svc } = makeService({ trackingMode: 'geofence' });
    await expect(svc.collect(ACCOUNT, DRIVER, { amountMinor: '1000' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

const PENDING_ROW = {
  id: ID,
  status: 'pending',
  amountMinor: 500_000n,
  currency: 'UZS',
  note: null,
  version: 1,
};
const PAYLOAD = {
  agentId: '11111111-1111-1111-1111-111111111111',
  organizationId: '22222222-2222-2222-2222-222222222222',
  cashDeskId: '33333333-3333-3333-3333-333333333333',
  version: 1,
};

describe("handOver — ПКО aynan bir marta va TO'G'RI summaga", () => {
  it('ПКО yaratiladi va post qilinadi; summa yozuvdan olinadi (klientdan EMAS)', async () => {
    const { svc, cashIn } = makeService({ row: PENDING_ROW });
    await svc.handOver(ACCOUNT, CASHIER, ID, PAYLOAD);

    expect(cashIn.create).toHaveBeenCalledTimes(1);
    const dto = cashIn.create.mock.calls[0]?.[1 as never] as never;
    // 2-argument — DTO (accountId, userId, dto)
    const body = cashIn.create.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(body.sumMinor).toBe('500000');
    expect(body.cashDeskId).toBe(PAYLOAD.cashDeskId);
    expect(cashIn.transition).toHaveBeenCalledTimes(1);
    expect(cashIn.transition.mock.calls[0]?.[3]).toBe('post');
    void dto;
  });

  it("holat AVVAL band qilinadi, ПКО KEYIN (poygada ikki ПКО bo'lmasin)", async () => {
    const { svc, handover, cashIn } = makeService({ row: PENDING_ROW });
    const order: string[] = [];
    handover.updateMany.mockImplementation(async () => {
      order.push('claim');
      return { count: 1 };
    });
    cashIn.create.mockImplementation(async () => {
      order.push('cashin');
      return { id: 'pko-1' };
    });
    await svc.handOver(ACCOUNT, CASHIER, ID, PAYLOAD);
    expect(order).toEqual(['claim', 'cashin']);
  });

  it('poygada yutqazgan kassir 409 oladi va ПКО YARATILMAYDI', async () => {
    const { svc, cashIn } = makeService({ row: PENDING_ROW, claimCount: 0 });
    await expect(svc.handOver(ACCOUNT, CASHIER, ID, PAYLOAD)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cashIn.create).not.toHaveBeenCalled();
  });

  it('allaqachon topshirilgan yozuv qayta qabul qilinmaydi', async () => {
    const { svc, cashIn } = makeService({ row: { ...PENDING_ROW, status: 'handed' } });
    await expect(svc.handOver(ACCOUNT, CASHIER, ID, PAYLOAD)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(cashIn.create).not.toHaveBeenCalled();
  });

  it("ПКО yaratilmasa holat 'pending'ga QAYTADI (pul osilib qolmaydi)", async () => {
    // Aks holda yozuv «topshirilgan» ko'rinardi, kassada esa pul yo'q —
    // farq hech qayerda ko'rinmasdi.
    const { svc, handover } = makeService({ row: PENDING_ROW, cashInFails: true });
    await expect(svc.handOver(ACCOUNT, CASHIER, ID, PAYLOAD)).rejects.toThrow();

    const rollback = handover.updateMany.mock.calls.at(-1)?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(rollback.data.status).toBe('pending');
    expect(rollback.data.handedAt).toBeNull();
    expect(rollback.data.cashInId).toBeNull();
  });
});

describe('cancel', () => {
  it('faqat kutayotganini bekor qiladi; topshirilganini rad etadi', async () => {
    const { svc, handover } = makeService({ claimCount: 0 });
    await expect(svc.cancel(ACCOUNT, ID)).rejects.toBeInstanceOf(ConflictException);
    const where = handover.updateMany.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(where.status).toBe('pending');
  });
});

describe('outstanding — «kimda qancha turibdi»', () => {
  it("faqat 'pending' yig'iladi va BigInt satrga aylantiriladi", async () => {
    const { svc, handover, client } = makeService({});
    handover.groupBy.mockResolvedValue([
      { driverId: DRIVER, _sum: { amountMinor: 750_000n }, _count: { _all: 2 } },
    ] as never);
    client.employee.findMany.mockResolvedValue([{ id: DRIVER, name: 'Ali' }] as never);

    const r = (await svc.outstanding(ACCOUNT)) as Array<Record<string, unknown>>;
    expect(handover.groupBy.mock.calls[0]?.[0].where.status).toBe('pending');
    expect(r[0]?.pendingMinor).toBe('750000');
    expect(r[0]?.driverName).toBe('Ali');
    expect(r[0]?.pendingCount).toBe(2);
  });

  it("yozuv yo'q bo'lsa bo'sh massiv (xodim so'rovi ham qilinmaydi)", async () => {
    const { svc, client } = makeService({});
    expect(await svc.outstanding(ACCOUNT)).toEqual([]);
    expect(client.employee.findMany).not.toHaveBeenCalled();
  });
});
