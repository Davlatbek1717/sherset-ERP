import { describe, expect, it, vi } from 'vitest';
import { TelegramService } from './telegram.service.js';

/**
 * Faza 21 qo'shimchasi — `INT-13` (MEDIUM). Reja Faza 21 ostida buni
 * «ehtiyot bo'l, bu fazada ham ko'r» deb belgilaydi, chunki `INT-01`
 * tuzatilgach bu bug JIM sozlama-yo'qolishidan TO'LIQ UZILISHGA aylanadi:
 * saveConfig `webhookSecret`ni NULL qilib yuborsa, fail-closed inbound
 * tekshiruvi o'sha akkauntning BARCHA update'larini 401 bilan rad eta boshlaydi.
 *
 * Bugacha: `telegram.service.ts:114-116` — `webhookUrl: parsed.webhookUrl ?? null`
 * (va secret/defaultChatId) ⇒ faqat botToken yangilangan (token rotatsiyasi)
 * so'rovda uchala maydon NULL'ga reset bo'lardi.
 *
 * Shartnoma: PATCH-semantika — kelmagan (`undefined`) maydon TEGILMAYDI;
 * ataylab bo'sh string yuborilsa (schema uni `null` qiladi) — tozalanadi.
 */
function makeService(existing: Record<string, unknown> | null) {
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c1',
    botUsername: null,
    botTokenCipher: 'x',
    webhookUrl: null,
    defaultChatId: null,
    enabled: true,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestMsg: null,
    ...data,
  }));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c1',
    botUsername: null,
    webhookUrl: null,
    defaultChatId: null,
    enabled: true,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestMsg: null,
    ...data,
  }));
  const prisma = {
    client: {
      telegramConfig: { findUnique: vi.fn(async () => existing), update, create },
    },
  };
  const service = new TelegramService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, update, create };
}

const EXISTING = {
  id: 'c1',
  accountId: 'acc',
  botTokenCipher: 'old-cipher',
  botUsername: 'MyShopBot',
  webhookUrl: 'https://erp.example/api/v1/telegram-webhook/acc',
  webhookSecret: 'live-secret',
  defaultChatId: '-100123',
  enabled: true,
  lastTestedAt: null,
  lastTestOk: null,
  lastTestMsg: null,
};

describe('TelegramService.saveConfig — PATCH semantikasi (INT-13)', () => {
  it('faqat botToken yangilanganda webhookUrl/webhookSecret/defaultChatId TEGILMAYDI', async () => {
    const { service, update } = makeService(EXISTING);
    await service.saveConfig('acc', { botToken: 'x'.repeat(46) });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data).toHaveProperty('botTokenCipher');
    // Reset qilinmasin — kalitlar umuman UZATILMASLIGI kerak.
    expect(data).not.toHaveProperty('webhookUrl');
    expect(data).not.toHaveProperty('webhookSecret');
    expect(data).not.toHaveProperty('defaultChatId');
  });

  it("ataylab bo'sh string yuborilsa maydon tozalanadi (null)", async () => {
    const { service, update } = makeService(EXISTING);
    await service.saveConfig('acc', { webhookSecret: '', defaultChatId: '' });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.webhookSecret).toBeNull();
    expect(data.defaultChatId).toBeNull();
    expect(data).not.toHaveProperty('webhookUrl');
  });

  it('berilgan qiymatlar yoziladi', async () => {
    const { service, update } = makeService(EXISTING);
    await service.saveConfig('acc', { defaultChatId: '-100999' });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.defaultChatId).toBe('-100999');
  });

  it('birinchi sozlashda (create) botToken majburiyligi saqlanadi', async () => {
    const { service, create } = makeService(null);
    await expect(service.saveConfig('acc', { defaultChatId: '-1' })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
