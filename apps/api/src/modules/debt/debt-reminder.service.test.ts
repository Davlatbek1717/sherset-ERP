import { describe, expect, it, vi } from 'vitest';
import { DebtReminderService } from './debt-reminder.service.js';

function makePrisma(due: unknown[] = []) {
  return {
    client: {
      debt: {
        findMany: vi.fn().mockResolvedValue(due),
        updateMany: vi.fn().mockResolvedValue({ count: due.length }),
      },
      employeeRole: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
}

function makeNotifications() {
  return { emit: vi.fn().mockResolvedValue(undefined) };
}

describe('DebtReminderService.remindDueCalls', () => {
  // 2026-07-20: "muammoli" (Debt.problem=true) qarzlar avtomatik eslatmadan
  // butunlay chiqarib tashlanishi kerak (findMany where'da problem:false).
  it('debt.findMany where clause excludes problem debts', async () => {
    const prisma = makePrisma([]);
    const service = new DebtReminderService(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      prisma as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      makeNotifications() as any,
    );

    await service.remindDueCalls();

    expect(prisma.client.debt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ problem: false }),
      }),
    );
  });

  // 2026-07-23 (foydalanuvchi qarori): cron mijozga AVTOMATIK xabar YUBORMAYDI —
  // faqat operatorga «qo'ng'iroq vaqti keldi» ichki bildirishnomasini yuboradi.
  // (Mijozga eslatma endi FAQAT qo'lda: per-qarz «Xabar yuborish» / bulk tugma.)
  // Servisda mijozga xabar yuboradigan telegram/sms bog'liqligi UMUMAN qolmagan.
  it('notifies the OPERATOR (owner) only, never the customer, and marks callRemindedAt', async () => {
    const dueRows = [
      {
        id: 'd-1',
        accountId: 'acc1',
        ownerId: 'emp1',
        counterparty: { name: 'Oddiy mijoz' },
      },
    ];
    const prisma = makePrisma(dueRows);
    const notifications = makeNotifications();
    const service = new DebtReminderService(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      prisma as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      notifications as any,
    );

    await service.remindDueCalls();

    // Operator (qarz egasi) «qo'ng'iroq vaqti keldi» ichki bildirishnomasini oladi.
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      'acc1',
      'emp1',
      'debt_call_due',
      expect.stringContaining('1 mijozga'),
      expect.stringContaining('Oddiy mijoz'),
      'DebtCalls',
      null,
    );
    // Dedup: qarz belgilanadi (keyingi tikда operator qayta ogohlantirilmasin).
    expect(prisma.client.debt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { callRemindedAt: expect.any(Date) } }),
    );
  });

  // The constructor takes ONLY prisma + notifications — no telegram/sms/template
  // service, so there is structurally no path for the cron to message a customer.
  it('constructs with exactly 2 dependencies (no customer-messaging deps)', () => {
    expect(DebtReminderService.length).toBe(2);
  });
});
