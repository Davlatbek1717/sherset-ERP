import { api } from '@/lib/api-client';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramChatCard } from './telegram-chat-card';

/**
 * Faza Q11 — `webhookSecretSet` ogohlantirishi (Faza 21 DEFER-1).
 *
 * Faza 21 inbound webhook tekshiruvini FAIL-CLOSED qildi: secret sozlanmagan
 * akkauntda Telegram'dan kelgan HAR update 401 oladi. `webhookSet` bu holatni
 * ko'rsata olmaydi (u faqat URL'ga qaraydi) ⇒ kartochka «sozlangan» bo'lib
 * turaveradi, aslida hech narsa kelmaydi — aynan jim-nosozlik klassi.
 *
 * Shartnoma: `webhookSet && !webhookSecretSet` ⇒ ogohlantirish ko'rinadi.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const BASE_STATUS = {
  configured: true,
  botUsername: 'MyShopBot',
  webhookSet: true,
  webhookSecretSet: true,
  connected: true,
  businessUserName: 'Ozodbek',
};

function mockApi(status: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/telegram/business-status')) return status;
    if (url.startsWith('/telegram/chats')) return { items: [] };
    return { items: [] };
  });
}

describe('TelegramChatCard — webhook secret ogohlantirishi', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("webhook bor, secret yo'q → ogohlantirish ko'rinadi", async () => {
    mockApi({ ...BASE_STATUS, webhookSet: true, webhookSecretSet: false });
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);

    const warn = await screen.findByTestId('tg-webhook-secret-warn');
    expect(warn).toBeInTheDocument();
    // Matn lug'atdan keladi (hardcoded emas) — uz tarjimasi «Webhook» bilan
    // boshlanadi va sababni aytadi.
    expect(warn.textContent ?? '').toMatch(/Webhook/);
  });

  it('ikkalasi ham sozlangan → ogohlantirish YO‘Q', async () => {
    mockApi(BASE_STATUS);
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);

    // Kartochka chizilganini kutamiz, keyin ogohlantirish yo'qligini tekshiramiz.
    await screen.findByTestId('cp-card-telegram');
    expect(screen.queryByTestId('tg-webhook-secret-warn')).toBeNull();
  });

  it("webhook umuman o'rnatilmagan bo'lsa ogohlantirish chiqmaydi (boshqa muammo)", async () => {
    mockApi({ ...BASE_STATUS, webhookSet: false, webhookSecretSet: false });
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);

    await screen.findByTestId('cp-card-telegram');
    expect(screen.queryByTestId('tg-webhook-secret-warn')).toBeNull();
  });
});
