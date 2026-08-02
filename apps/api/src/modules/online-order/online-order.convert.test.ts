import { describe, expect, it, vi } from 'vitest';
import { OnlineOrderService } from './online-order.service.js';

/**
 * convertToCustomerOrder — ma'lumot yaxlitligi qulfi (TZ 2-bo'lim §0.1/1).
 *
 * V1 stub `customerOrderId` ga TASODIFIY generatsiya qilingan UUID yozardi —
 * ya'ni bazada hech qayerga ishora qilmaydigan havola qolardi. Bu «bajarilmagan
 * funksiya» emas, ma'lumot yaxlitligining buzilishi: hisobot yoki integratsiya
 * o'sha id bo'yicha buyurtma qidirsa — topmaydi, sababi esa ko'rinmaydi.
 *
 * To'g'ri xulq: `customerOrderId` faqat HAQIQIY, shu ijarachiga tegishli
 * CustomerOrder ga bog'lanadi; aks holda holat `accepted` da qoladi.
 */

const ACC = 'acc-1';
const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';
const CO_ID = '00000000-0000-0000-0000-0000000000bb';

function makeService(opts: {
  state?: string;
  /** null = shu ijarachida bunday CustomerOrder yo'q */
  customerOrder?: { id: string } | null;
}) {
  const onlineOrder = {
    findFirst: vi.fn().mockResolvedValue({
      id: ORDER_ID,
      accountId: ACC,
      state: opts.state ?? 'accepted',
      sumMinor: 0n,
      customerOrderId: null,
      channel: { id: 'ch-1', name: 'Sayt', kind: 'website' },
    }),
    update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: ORDER_ID,
      accountId: ACC,
      sumMinor: 0n,
      customerOrderId: null,
      ...data,
    })),
  };
  const customerOrder = {
    findFirst: vi.fn().mockResolvedValue(opts.customerOrder ?? null),
  };
  const prisma = { client: { onlineOrder, customerOrder } };
  // biome-ignore lint/suspicious/noExplicitAny: minimal Prisma stub for a unit test
  return { svc: new OnlineOrderService(prisma as any), onlineOrder, customerOrder };
}

describe('OnlineOrderService.convertToCustomerOrder', () => {
  it('bog‘laydi: haqiqiy CustomerOrder id bilan converted bo‘ladi', async () => {
    const { svc, onlineOrder } = makeService({ customerOrder: { id: CO_ID } });

    const res = await svc.convertToCustomerOrder(ACC, ORDER_ID, { customerOrderId: CO_ID });

    expect(res.state).toBe('converted');
    expect(res.customerOrderId).toBe(CO_ID);
    expect(onlineOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: 'converted', customerOrderId: CO_ID },
      }),
    );
  });

  it('SOXTA UUID yozmaydi: customerOrderId berilmasa rad etadi', async () => {
    const { svc, onlineOrder } = makeService({});

    await expect(svc.convertToCustomerOrder(ACC, ORDER_ID, {})).rejects.toThrow();
    // Eng muhimi: hech narsa yozilmasligi — holat 'accepted' da qoladi.
    expect(onlineOrder.update).not.toHaveBeenCalled();
  });

  it('boshqa ijarachining CustomerOrder id sini qabul qilmaydi', async () => {
    const { svc, onlineOrder } = makeService({ customerOrder: null });

    await expect(
      svc.convertToCustomerOrder(ACC, ORDER_ID, { customerOrderId: CO_ID }),
    ).rejects.toThrow();
    expect(onlineOrder.update).not.toHaveBeenCalled();
  });

  it('accepted bo‘lmagan holatdan konvertatsiya qilmaydi', async () => {
    const { svc, onlineOrder } = makeService({
      state: 'pending',
      customerOrder: { id: CO_ID },
    });

    await expect(
      svc.convertToCustomerOrder(ACC, ORDER_ID, { customerOrderId: CO_ID }),
    ).rejects.toThrow();
    expect(onlineOrder.update).not.toHaveBeenCalled();
  });
});
