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

function makeTelegram() {
  return { notifyCounterparty: vi.fn().mockResolvedValue(undefined) };
}

function makeSms() {
  return {
    getContacts: vi
      .fn()
      .mockResolvedValue({ phone: '+998900000000', card: '0000', cardOwner: 'X' }),
  };
}

describe('DebtReminderService.remindDueCalls', () => {
  // 2026-07-20: "muammoli" (Debt.problem=true) qarzlar avtomatik eslatmadan
  // butunlay chiqarib tashlanishi kerak — foydalanuvchi bir mijozni muammoli
  // deb belgilagandan keyin ham eslatma davom etib yuborilishini kuzatdi
  // (chunki setProblem() `nextContactAt`ni majburiy qiladi va
  // `callRemindedAt`ni tozalaydi — keyingi cron tikida qayta ushlanadi).
  // Qo'lda "xabar yuborish" tugmasi (debt.service.ts sendTelegramReminder)
  // bu flagdan mustaqil — operator xohlasa qo'lda baribir yubora oladi.
  it('debt.findMany where clause excludes problem debts', async () => {
    const prisma = makePrisma([]);
    const service = new DebtReminderService(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      prisma as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      makeNotifications() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      makeTelegram() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      makeSms() as any,
    );

    await service.remindDueCalls();

    expect(prisma.client.debt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ problem: false }),
      }),
    );
  });

  it("muammoli deb belgilangan qarzga Telegram eslatmasi yubormaydi (findMany natijasida yo'q bo'lgani uchun)", async () => {
    // findMany o'zi problem:false filtrini qo'llaydi (Prisma tomonidan) —
    // shu sabab mock natijasida "muammoli" qarz umuman qaytmaydi, va pastdagi
    // loop (notifyCounterparty chaqiruvi) unga tegmaydi.
    const dueRows = [
      {
        id: 'd-1',
        accountId: 'acc1',
        ownerId: 'emp1',
        counterpartyId: 'cp1',
        totalMinor: 100n,
        paidMinor: 0n,
        counterparty: { name: 'Oddiy mijoz' },
      },
    ];
    const prisma = makePrisma(dueRows);
    const telegram = makeTelegram();
    const service = new DebtReminderService(
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      prisma as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      makeNotifications() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      telegram as any,
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      makeSms() as any,
    );

    await service.remindDueCalls();

    // Faqat findMany qaytargan (ya'ni muammoli bo'lmagan) qarzga yuboriladi.
    expect(telegram.notifyCounterparty).toHaveBeenCalledTimes(1);
    expect(telegram.notifyCounterparty).toHaveBeenCalledWith(
      'acc1',
      'cp1',
      expect.stringContaining('Oddiy mijoz'),
      'reminder',
    );
  });
});
