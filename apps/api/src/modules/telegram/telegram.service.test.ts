import { describe, expect, it, vi } from 'vitest';
import { TelegramService } from './telegram.service.js';

/**
 * notifyCounterparty transport-tanlash testi: faol userbot (HrTelegramAccount)
 * bo'lsa xabar HrTelegramOutbox'ga (shaxsiy raqam yo'li) qo'yiladi; aks holda
 * eski Bot API / Business yo'liga tushadi. Prisma qo'lda mock qilingan
 * (product.service.test.ts uslubi) — DB yo'q.
 */
function makeService(opts: {
  userbotActive: boolean;
  counterpartyPhone?: string | null;
}) {
  const outboxCreate = vi.fn(async () => ({ id: 'o1' }));
  const prisma = {
    client: {
      hrTelegramAccount: {
        findFirst: vi.fn(async () => (opts.userbotActive ? { id: 'ub1' } : null)),
      },
      counterparty: {
        findFirst: vi.fn(async () => ({ phone: opts.counterpartyPhone ?? null })),
      },
      hrTelegramOutbox: { create: outboxCreate },
      // Fallback (Bot API) yo'li: config o'chiq → 'telegram_off' (fallback'ga
      // yetganini isbotlaydi, haqiqiy Telegram chaqiruvisiz).
      telegramConfig: { findUnique: vi.fn(async () => ({ enabled: false })) },
      telegramChat: { findFirst: vi.fn(async () => null) },
    },
  };
  const attachments = {};
  const lookup = { lookup: vi.fn(async () => ({ available: false, found: false })) };
  const service = new TelegramService(prisma as never, attachments as never, lookup as never);
  return { service, prisma, outboxCreate };
}

describe('TelegramService.notifyCounterparty — userbot routing', () => {
  it("faol userbot + telefon bor → HrTelegramOutbox'ga qo'yadi", async () => {
    const { service, outboxCreate } = makeService({
      userbotActive: true,
      counterpartyPhone: '901234567',
    });
    const res = await service.notifyCounterparty('acc', 'cp1', 'Salom qarz', 'debt_issued');
    expect(res).toEqual({ sent: true, reason: 'queued_userbot' });
    expect(outboxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc',
        counterpartyId: 'cp1',
        toPhone: '+998901234567', // normalizeTelegramPhone qo'llangan
        messageText: 'Salom qarz',
        status: 'pending',
        sourceEventType: 'debt.debt_issued',
      }),
    });
  });

  it("faol userbot + telefon YO'Q → no_phone, outbox chaqirilmaydi", async () => {
    const { service, outboxCreate } = makeService({
      userbotActive: true,
      counterpartyPhone: null,
    });
    const res = await service.notifyCounterparty('acc', 'cp1', 'Salom', 'reminder');
    expect(res).toEqual({ sent: false, reason: 'no_phone' });
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it("userbot faol emas → eski Bot API yo'liga tushadi (fallback)", async () => {
    const { service, outboxCreate } = makeService({ userbotActive: false });
    const res = await service.notifyCounterparty('acc', 'cp1', 'Salom', 'payment');
    // Config o'chiq → fallback yo'li 'telegram_off' qaytaradi (userbot emas).
    expect(res).toEqual({ sent: false, reason: 'telegram_off' });
    expect(outboxCreate).not.toHaveBeenCalled();
  });
});

/**
 * Panel umumiy chat-send (2026-07-17) — buyurtma/kontragent kartochkasidagi
 * «yozish» tugmasi. Faol userbot + telefon bor → HrTelegramOutbox'ga
 * `manual_chat` sifatida; aks holda aniq xato (bloklaydi, jimgina emas).
 */
describe('TelegramService.sendChatToCounterparty — panel yuborish', () => {
  it("faol userbot + telefon → outbox'ga manual_chat, out qaytaradi", async () => {
    const { service, outboxCreate } = makeService({
      userbotActive: true,
      counterpartyPhone: '901234567',
    });
    const res = await service.sendChatToCounterparty('acc', 'cp1', '  Salom  ');
    expect(res).toEqual({ id: 'o1', status: 'pending', direction: 'out' });
    expect(outboxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc',
        counterpartyId: 'cp1',
        toPhone: '+998901234567',
        messageText: 'Salom', // trim qilingan
        status: 'pending',
        sourceEventType: 'manual_chat',
      }),
    });
  });

  it("bo'sh matn → BadRequest, outbox chaqirilmaydi", async () => {
    const { service, outboxCreate } = makeService({
      userbotActive: true,
      counterpartyPhone: '901234567',
    });
    await expect(service.sendChatToCounterparty('acc', 'cp1', '   ')).rejects.toThrow();
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it("raqam ulanmagan (userbot yo'q) → BadRequest", async () => {
    const { service, outboxCreate } = makeService({ userbotActive: false });
    await expect(service.sendChatToCounterparty('acc', 'cp1', 'Salom')).rejects.toThrow();
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it("kontragentda telefon yo'q → BadRequest", async () => {
    const { service, outboxCreate } = makeService({
      userbotActive: true,
      counterpartyPhone: null,
    });
    await expect(service.sendChatToCounterparty('acc', 'cp1', 'Salom')).rejects.toThrow();
    expect(outboxCreate).not.toHaveBeenCalled();
  });
});

/**
 * counterpartyThread — MTProto chiquvchi (HrTelegramOutbox) ∪ Business
 * ikki-tomonlama (TelegramChatMessage) birlashmasi. 2026-07-20: Business
 * xabaridagi CHEK RASMI (attachmentId/fileName/mimeType) endi thread'ga ham
 * o'tishi kerak — aks holda OrderTelegramPanel'da chek ko'rinmaydi (debts/[id]
 * sahifasida TelegramChatCard o'rniga shu panel ishlatiladigan bo'ldi).
 */
describe('TelegramService.counterpartyThread — attachment passthrough', () => {
  it('Business xabaridagi chek rasmi thread itemga o‘tadi, outbox xabarida null', async () => {
    const prisma = {
      client: {
        counterparty: {
          findFirst: vi.fn(async () => ({
            id: 'cp1',
            name: 'Konserva zavod',
            phone: '+998901234567',
          })),
        },
        hrTelegramOutbox: {
          findMany: vi.fn(async () => [
            {
              id: 'ob1',
              messageText: 'Eslatma matni',
              status: 'sent',
              sourceEventType: 'debt.reminder',
              createdAt: new Date('2026-07-19T09:00:00Z'),
            },
          ]),
        },
        telegramChat: { findFirst: vi.fn(async () => ({ id: 'chat1' })) },
        telegramChatMessage: {
          findMany: vi.fn(async () => [
            {
              id: 'msg1',
              direction: 'in',
              text: '',
              kind: 'photo',
              autoKind: null,
              attachmentId: 'att1',
              fileName: 'chek.jpg',
              mimeType: 'image/jpeg',
              createdAt: new Date('2026-07-19T09:05:00Z'),
            },
          ]),
        },
        hrTelegramAccount: { findFirst: vi.fn(async () => ({ phoneNumber: '+998901111111' })) },
      },
    };
    const attachments = {};
    const lookup = { lookup: vi.fn(async () => ({ available: false, found: false })) };
    const service = new TelegramService(prisma as never, attachments as never, lookup as never);

    const res = await service.counterpartyThread('acc', 'cp1', {});

    expect(res.items).toHaveLength(2);
    const outboxItem = res.items.find((i) => i.id === 'ob-ob1');
    expect(outboxItem).toMatchObject({ attachmentId: null, fileName: null, mimeType: null });
    const businessItem = res.items.find((i) => i.id === 'tg-msg1');
    expect(businessItem).toMatchObject({
      attachmentId: 'att1',
      fileName: 'chek.jpg',
      mimeType: 'image/jpeg',
    });
  });
});
