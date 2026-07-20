import { describe, expect, it, vi } from 'vitest';
import { TelegramService } from './telegram.service.js';

/**
 * counterpartyThread — kanonik transkript (TelegramChatMessage) + yetkazilmagan
 * HrTelegramOutbox overlay (2026-07-20 to'liq-tarix). Yetkazilgan (tgMessageId
 * mos) outbox qatori DUBL bo'lib ko'rsatilmasligi kerak — kanonik transkript
 * uni allaqachon o'z ichiga oladi (backfill/listener yozgan).
 */
describe('counterpartyThread — kanonik transkript + yetkazilmagan overlay', () => {
  function makeService(opts: {
    canonical: unknown[];
    outbox: unknown[];
    backfill?: { status: string; messagesImported: number } | null;
  }) {
    const prisma = {
      client: {
        counterparty: {
          findFirst: vi.fn(async () => ({ id: 'cp1', name: 'Ali', phone: '901' })),
        },
        telegramChat: { findFirst: vi.fn(async () => ({ id: 'chat1' })) },
        telegramChatMessage: { findMany: vi.fn(async () => opts.canonical) },
        hrTelegramOutbox: { findMany: vi.fn(async () => opts.outbox) },
        hrTelegramAccount: { findFirst: vi.fn(async () => ({ phoneNumber: '+99890' })) },
        telegramBackfillJob: {
          findFirst: vi.fn(async () => opts.backfill ?? null),
        },
      },
    };
    return new TelegramService(prisma as never, {} as never, {} as never);
  }

  it("yetkazilgan outbox (mos tgMessageId) DUBL emas; yetkazilmagan overlay ko'rinadi", async () => {
    const svc = makeService({
      canonical: [
        {
          id: 'm1',
          direction: 'out',
          text: 'a',
          kind: 'text',
          autoKind: null,
          attachmentId: null,
          fileName: null,
          mimeType: null,
          fwdFromName: null,
          tgMessageId: 100n,
          createdAt: new Date('2026-07-20T10:00:00Z'),
        },
      ],
      outbox: [
        // yetkazilgan (tgMessageId=100 kanonikda bor) → overlay'da YO'Q
        {
          id: 'o1',
          messageText: 'a',
          status: 'sent',
          telegramMessageId: '100',
          sourceEventType: 'manual_chat',
          createdAt: new Date('2026-07-20T09:59:00Z'),
        },
        // yetkazilmagan (pending) → overlay'da BOR
        {
          id: 'o2',
          messageText: 'kutmoqda',
          status: 'pending',
          telegramMessageId: null,
          sourceEventType: 'debt.reminder',
          createdAt: new Date('2026-07-20T11:00:00Z'),
        },
      ],
      backfill: { status: 'done', messagesImported: 5 },
    });

    const res = await svc.counterpartyThread('acc', 'cp1', {});
    const ids = res.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('tg-m1'); // kanonik
    expect(ids).toContain('ob-o2'); // yetkazilmagan overlay
    expect(ids).not.toContain('ob-o1'); // yetkazilgan dubl YO'Q
    expect(res.backfill).toEqual({ status: 'done', messagesImported: 5 });
  });

  it("chat yo'q → bo'sh items, backfill null", async () => {
    const prisma = {
      client: {
        counterparty: { findFirst: vi.fn(async () => ({ id: 'cp1', name: 'Ali', phone: null })) },
        telegramChat: { findFirst: vi.fn(async () => null) },
        telegramChatMessage: { findMany: vi.fn(async () => []) },
        hrTelegramOutbox: { findMany: vi.fn(async () => []) },
        hrTelegramAccount: { findFirst: vi.fn(async () => null) },
        telegramBackfillJob: { findFirst: vi.fn(async () => null) },
      },
    };
    const svc = new TelegramService(prisma as never, {} as never, {} as never);
    const res = await svc.counterpartyThread('acc', 'cp1', {});
    expect(res.items).toEqual([]);
    expect(res.backfill).toBeNull();
    expect(res.connected).toBe(false);
  });
});
