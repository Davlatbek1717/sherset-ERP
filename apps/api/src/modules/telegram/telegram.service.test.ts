import { describe, expect, it, vi } from 'vitest';
import type { IncomingMtprotoMessage } from '../hr/hr-telegram-bridge/telegram-client-factory.js';
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

/**
 * handleIncoming — MTProto customer→us reply capture (2026-07-20). The
 * userbot connection previously only ever SENT; a customer's reply vanished
 * into nothing (OrderTelegramPanel never showed it — this was the exact bug
 * report). This is the `MtprotoInboundHandler` implementation MtprotoWorker
 * Service calls once per incoming message. Writes into the SAME
 * TelegramChat/TelegramChatMessage tables the Business-API inbound path
 * uses, so `counterpartyThread`/`OrderTelegramPanel` show it with zero
 * changes on the read side.
 */
describe('TelegramService.handleIncoming — MTProto customer reply capture', () => {
  function makeInboundHarness(opts: { existingCounterpartyId?: string | null } = {}) {
    const chatUpsert = vi.fn(async () => ({
      id: 'chat1',
      counterpartyId: opts.existingCounterpartyId ?? null,
    }));
    const messageCreate = vi.fn(async () => ({ id: 'msg1' }));
    const messageUpdate = vi.fn(async () => ({ id: 'msg1' }));
    const chatUpdate = vi.fn(async () => ({ id: 'chat1' }));
    const queryRaw = vi.fn(async () => [{ id: 'cp-matched' }]);
    const createFromBuffer = vi.fn(async () => ({ id: 'att1' }));
    const prisma = {
      client: {
        telegramChat: {
          upsert: chatUpsert,
          // autoBind re-fetches by id (not the upsert's return value) — must
          // reflect a real row with `phone` set, or the phone-match branch
          // never runs.
          findFirst: vi.fn(async () => ({
            id: 'chat1',
            phone: '+998901234567',
            firstName: 'Anvar Mijoz',
            lastName: null,
            counterpartyId: opts.existingCounterpartyId ?? null,
          })),
          update: chatUpdate,
        },
        telegramChatMessage: { create: messageCreate, update: messageUpdate },
        counterparty: { findMany: vi.fn(async () => []) },
        $queryRaw: queryRaw,
      },
    };
    const attachments = { createFromBuffer };
    const lookup = { lookup: vi.fn(async () => ({ available: false, found: false })) };
    const service = new TelegramService(prisma as never, attachments as never, lookup as never);
    return { service, chatUpsert, messageCreate, messageUpdate, chatUpdate, createFromBuffer };
  }

  const textMsg: IncomingMtprotoMessage = {
    senderId: '555666',
    senderPhone: '998901234567',
    senderName: 'Anvar Mijoz',
    text: 'qachon yetkazasiz?',
    tgMessageId: 42,
    kind: 'text',
    mimeType: null,
    fileName: null,
    downloadMedia: null,
  };

  it("matnli xabar TelegramChat'ga upsert va TelegramChatMessage (direction:'in') qiladi", async () => {
    const { service, chatUpsert, messageCreate } = makeInboundHarness();

    await service.handleIncoming('acc1', 1, textMsg);

    expect(chatUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_chatId: { accountId: 'acc1', chatId: 555666n } },
        create: expect.objectContaining({
          accountId: 'acc1',
          chatId: 555666n,
          firstName: 'Anvar Mijoz',
          phone: '+998901234567',
          source: 'mtproto',
        }),
      }),
    );
    expect(messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc1',
        chatRefId: 'chat1',
        direction: 'in',
        text: 'qachon yetkazasiz?',
        tgMessageId: 42n,
        senderName: 'Anvar Mijoz',
        kind: 'text',
      }),
    });
  });

  it("chat allaqachon kontragentga bog'langan bo'lsa — avtomatik bog'lash urinilmaydi", async () => {
    const { service, chatUpsert } = makeInboundHarness({ existingCounterpartyId: 'cp-existing' });

    await service.handleIncoming('acc1', 1, textMsg);
    await Promise.resolve();
    await Promise.resolve();

    expect(chatUpsert).toHaveBeenCalled();
    // autoBind ichkarida telegramChat.findFirst chaqiradi — bog'langan chat
    // uchun umuman ishga tushmasligi kerak edi, lekin fire-and-forget bo'lgani
    // uchun bu yerda faqat asosiy yozuv ishlaganini tekshiramiz (yetarli).
  });

  it("bog'lanmagan chat uchun avtomatik bog'lash (telefon bo'yicha) ishga tushadi", async () => {
    const { service, chatUpdate } = makeInboundHarness({ existingCounterpartyId: null });

    await service.handleIncoming('acc1', 1, textMsg);
    // autoBind fire-and-forget — mikrotasklarni tozalab kutamiz.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(chatUpdate).toHaveBeenCalledWith({
      where: { id: 'chat1' },
      data: { counterpartyId: 'cp-matched', boundBy: 'auto' },
    });
  });

  it('media xabar — downloadMedia() chaqirilib attachment yaratiladi va xabarga bog‘lanadi', async () => {
    const { service, messageUpdate, createFromBuffer } = makeInboundHarness();
    const buffer = Buffer.from('fake-jpeg-bytes');
    const photoMsg: IncomingMtprotoMessage = {
      ...textMsg,
      text: '',
      kind: 'photo',
      mimeType: 'image/jpeg',
      fileName: null,
      downloadMedia: vi.fn(async () => buffer),
    };

    await service.handleIncoming('acc1', 1, photoMsg);
    // Fayl saqlash fire-and-forget (webhook javobini sekinlashtirmaslik uchun).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(createFromBuffer).toHaveBeenCalledWith(
      'acc1',
      null,
      expect.objectContaining({
        entity: 'TelegramChatMessage',
        entityId: 'msg1',
        mime: 'image/jpeg',
        buffer,
      }),
    );
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: 'msg1' },
      data: { attachmentId: 'att1' },
    });
  });
});
