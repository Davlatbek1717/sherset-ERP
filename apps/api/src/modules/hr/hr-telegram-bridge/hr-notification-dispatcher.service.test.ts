import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrNotificationDispatcher } from './hr-notification-dispatcher.service.js';
import { HrCustomerOrderListener } from './listeners/customer-order.listener.js';
import { HrDemandListener } from './listeners/demand.listener.js';
import { HrPaymentInListener } from './listeners/payment-in.listener.js';
import { HrSalesReturnListener } from './listeners/sales-return.listener.js';
import { HrSupplyListener } from './listeners/supply.listener.js';

function makePrisma() {
  return {
    client: {
      counterparty: { findFirst: vi.fn() },
      counterpartyBalance: { findFirst: vi.fn() },
      hrTelegramOutbox: { create: vi.fn() },
    },
  };
}

function makeTemplates() {
  return { findActive: vi.fn() };
}

const baseTemplate = {
  id: 'tpl-1',
  accountId: 'acc1',
  docType: 'demand',
  eventType: 'posted',
  templateText:
    "Hurmatli {{= counterparty.name }}, sizga {{= demand.totalFormatted }} so'mlik tovar berildi. Balans: {{= balance.formatted }}.",
  isActive: true,
  largeSaleMinThreshold: null,
};

// The dispatch pipeline is shared; exercise it through HrDemandListener (one
// thin @OnEvent wrapper over HrNotificationDispatcher.dispatch).
describe('HrNotificationDispatcher (via HrDemandListener.onDemandPosted)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let templates: ReturnType<typeof makeTemplates>;
  let listener: HrDemandListener;

  beforeEach(() => {
    prisma = makePrisma();
    templates = makeTemplates();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const dispatcher = new HrNotificationDispatcher(prisma as any, templates as any);
    listener = new HrDemandListener(dispatcher);
  });

  it('renders + enqueues HrTelegramOutbox row on happy path', async () => {
    templates.findActive.mockResolvedValue(baseTemplate);
    prisma.client.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1',
      name: 'OOO Test',
      phone: '+998901234567',
    });
    prisma.client.counterpartyBalance.findFirst.mockResolvedValue({
      balanceMinor: 50_000_00n,
    });

    await listener.onDemandPosted({
      accountId: 'acc1',
      demandId: 'd-1',
      counterpartyId: 'cp-1',
      totalMinor: 1_234_500n,
      postedAt: new Date(),
    });

    expect(prisma.client.hrTelegramOutbox.create).toHaveBeenCalledTimes(1);
    const outArgs = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: {
        accountId: string;
        toPhone: string;
        messageText: string;
        sourceEventType: string;
        sourceDocId: string;
      };
    };
    expect(outArgs.data.accountId).toBe('acc1');
    expect(outArgs.data.toPhone).toBe('+998901234567');
    expect(outArgs.data.sourceEventType).toBe('demand.posted');
    expect(outArgs.data.sourceDocId).toBe('d-1');
    expect(outArgs.data.messageText).toBe(
      "Hurmatli OOO Test, sizga 12 345 so'mlik tovar berildi. Balans: 50 000.",
    );
  });

  it('no template configured → silent skip (no outbox row)', async () => {
    templates.findActive.mockResolvedValue(null);

    await listener.onDemandPosted({
      accountId: 'acc1',
      demandId: 'd-1',
      counterpartyId: 'cp-1',
      totalMinor: 1_000_00n,
      postedAt: new Date(),
    });

    expect(prisma.client.counterparty.findFirst).not.toHaveBeenCalled();
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('counterparty missing → silent skip', async () => {
    templates.findActive.mockResolvedValue(baseTemplate);
    prisma.client.counterparty.findFirst.mockResolvedValue(null);

    await listener.onDemandPosted({
      accountId: 'acc1',
      demandId: 'd-1',
      counterpartyId: 'cp-deleted',
      totalMinor: 1_000_00n,
      postedAt: new Date(),
    });

    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('counterparty has no phone → silent skip', async () => {
    templates.findActive.mockResolvedValue(baseTemplate);
    prisma.client.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1',
      name: 'No Phone Inc',
      phone: null,
    });

    await listener.onDemandPosted({
      accountId: 'acc1',
      demandId: 'd-1',
      counterpartyId: 'cp-1',
      totalMinor: 1_000_00n,
      postedAt: new Date(),
    });

    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('normalizes counterparty phone before storing on outbox', async () => {
    templates.findActive.mockResolvedValue(baseTemplate);
    prisma.client.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1',
      name: 'X',
      phone: '901234567', // 9-digit, expand to +998…
    });
    prisma.client.counterpartyBalance.findFirst.mockResolvedValue(null);

    await listener.onDemandPosted({
      accountId: 'acc1',
      demandId: 'd-1',
      counterpartyId: 'cp-1',
      totalMinor: 100_00n,
      postedAt: new Date(),
    });

    const outArgs = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: { toPhone: string; messageText: string };
    };
    expect(outArgs.data.toPhone).toBe('+998901234567');
    // Balance "—" used when no CounterpartyBalance row.
    expect(outArgs.data.messageText).toContain('Balans: —');
  });

  it('invalid phone format → silent skip (does not crash listener)', async () => {
    templates.findActive.mockResolvedValue(baseTemplate);
    prisma.client.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1',
      name: 'X',
      phone: 'not-a-phone',
    });

    await listener.onDemandPosted({
      accountId: 'acc1',
      demandId: 'd-1',
      counterpartyId: 'cp-1',
      totalMinor: 100_00n,
      postedAt: new Date(),
    });

    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('template render error → silent log, no outbox row (does not propagate)', async () => {
    templates.findActive.mockResolvedValue({
      ...baseTemplate,
      // References `unknownField` which isn't in the render context → ReferenceError under useWith.
      templateText: 'Hi {{= unknownField.x }}',
    });
    prisma.client.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1',
      name: 'X',
      phone: '+998901234567',
    });
    prisma.client.counterpartyBalance.findFirst.mockResolvedValue(null);

    await listener.onDemandPosted({
      accountId: 'acc1',
      demandId: 'd-1',
      counterpartyId: 'cp-1',
      totalMinor: 100_00n,
      postedAt: new Date(),
    });

    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('DB error during enqueue → swallowed (listener never throws)', async () => {
    templates.findActive.mockResolvedValue(baseTemplate);
    prisma.client.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1',
      name: 'X',
      phone: '+998901234567',
    });
    prisma.client.counterpartyBalance.findFirst.mockResolvedValue(null);
    prisma.client.hrTelegramOutbox.create.mockRejectedValue(new Error('db connection lost'));

    await expect(
      listener.onDemandPosted({
        accountId: 'acc1',
        demandId: 'd-1',
        counterpartyId: 'cp-1',
        totalMinor: 100_00n,
        postedAt: new Date(),
      }),
    ).resolves.not.toThrow();
  });
});

describe('per-document listeners route to the right docType/context', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let templates: ReturnType<typeof makeTemplates>;
  let paymentIn: HrPaymentInListener;
  let customerOrder: HrCustomerOrderListener;
  let supply: HrSupplyListener;
  let salesReturn: HrSalesReturnListener;

  beforeEach(() => {
    prisma = makePrisma();
    templates = makeTemplates();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const dispatcher = new HrNotificationDispatcher(prisma as any, templates as any);
    paymentIn = new HrPaymentInListener(dispatcher);
    customerOrder = new HrCustomerOrderListener(dispatcher);
    supply = new HrSupplyListener(dispatcher);
    salesReturn = new HrSalesReturnListener(dispatcher);
    prisma.client.counterparty.findFirst.mockResolvedValue({
      id: 'cp-1',
      name: 'X',
      phone: '+998901234567',
    });
    prisma.client.counterpartyBalance.findFirst.mockResolvedValue(null);
  });

  it('payment_in.posted → renders {{= payment.sumFormatted }}', async () => {
    templates.findActive.mockResolvedValue({
      ...baseTemplate,
      docType: 'payment_in',
      eventType: 'posted',
      templateText: 'Hi {{= counterparty.name }}, payment {{= payment.sumFormatted }}',
    });

    await paymentIn.onPaymentInPosted({
      accountId: 'acc1',
      paymentInId: 'p-1',
      counterpartyId: 'cp-1',
      sumMinor: 5_000_00n,
      postedAt: new Date(),
    });

    const args = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: { messageText: string; sourceEventType: string };
    };
    expect(args.data.messageText).toBe('Hi X, payment 5 000');
    expect(args.data.sourceEventType).toBe('payment_in.posted');
  });

  it('customer_order.created → renders {{= order.totalFormatted }}', async () => {
    templates.findActive.mockResolvedValue({
      ...baseTemplate,
      docType: 'customer_order',
      eventType: 'created',
      templateText: 'Order {{= order.totalFormatted }}',
    });

    await customerOrder.onCustomerOrderCreated({
      accountId: 'acc1',
      customerOrderId: 'co-1',
      counterpartyId: 'cp-1',
      totalMinor: 750_00n,
      createdAt: new Date(),
    });

    const args = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: { messageText: string };
    };
    expect(args.data.messageText).toBe('Order 750');
  });

  it('supply.posted → confirmation message + itemized «qabul cheki»', async () => {
    templates.findActive.mockResolvedValue({
      ...baseTemplate,
      docType: 'supply',
      eventType: 'posted',
      templateText: 'Supply {{= supply.totalFormatted }} № {{= supply.number }}',
    });

    await supply.onSupplyPosted({
      accountId: 'acc1',
      supplyId: 's-1',
      counterpartyId: 'cp-1',
      totalMinor: 10_000_00n,
      postedAt: new Date(),
      supplyNumber: '00772',
      items: [
        {
          name: 'Sement M400',
          quantity: '50',
          uom: 'шт',
          priceMinor: 200_00n,
          lineSumMinor: 10_000_00n,
        },
      ],
    });

    // Message 1 — the admin-template confirmation (with the new supply.number).
    const first = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: { messageText: string; toPhone: string };
    };
    expect(first.data.messageText).toBe('Supply 10 000 № 00772');

    // Message 2 — the code-generated receipt, enqueued to the same phone.
    expect(prisma.client.hrTelegramOutbox.create).toHaveBeenCalledTimes(2);
    const second = prisma.client.hrTelegramOutbox.create.mock.calls[1]?.[0] as {
      data: { messageText: string; toPhone: string; sourceEventType: string };
    };
    expect(second.data.messageText).toContain('🧾 QABUL CHEKI');
    expect(second.data.messageText).toContain("50 шт × 200 = 10 000 so'm");
    expect(second.data.messageText).toContain("Jami: 10 000 so'm");
    expect(second.data.toPhone).toBe(first.data.toPhone);
    expect(second.data.sourceEventType).toBe('supply.posted');
  });

  it('sales_return.posted → renders {{= returnDoc.totalFormatted }}', async () => {
    templates.findActive.mockResolvedValue({
      ...baseTemplate,
      docType: 'sales_return',
      eventType: 'posted',
      templateText: 'Return {{= returnDoc.totalFormatted }}',
    });

    await salesReturn.onSalesReturnPosted({
      accountId: 'acc1',
      salesReturnId: 'sr-1',
      counterpartyId: 'cp-1',
      totalMinor: 300_00n,
      postedAt: new Date(),
    });

    const args = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: { messageText: string };
    };
    expect(args.data.messageText).toBe('Return 300');
  });
});
