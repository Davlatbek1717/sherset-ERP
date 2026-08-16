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

/**
 * Yetkazish holati (2026-08-16). Eng muhim shartnoma — `delivery: null`
 * bo'lganda HECH NARSA chizilmaydi: «yuborildi» deb taxmin qilish bu
 * loyihada allaqachon xato qilingan klass (`pending` dalil emas).
 */
describe('TelegramChatCard — aloqa holati', () => {
  function mockReach(state: string, reason: string | null = null) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/telegram/business-status')) return BASE_STATUS;
      if (url.includes('/reachability')) return { state, reason };
      if (url.startsWith('/telegram/chats')) return { items: [] };
      return { items: [] };
    });
  }

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('never_contacted → sabab OCHIQ aytiladi (jim qolmaydi)', async () => {
    mockReach('never_contacted');
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    const el = await screen.findByTestId('tg-reachability');
    expect(el.textContent ?? '').toMatch(/yozmagan/);
  });

  it('no_phone → aniq sabab', async () => {
    mockReach('unreachable', 'no_phone');
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    const el = await screen.findByTestId('tg-reachability');
    expect(el.textContent ?? '').toMatch(/Telefon/);
  });

  it('failed → Telegram sababi ko`rsatiladi', async () => {
    mockReach('unreachable', 'raqam Telegramda yoq');
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    const el = await screen.findByTestId('tg-reachability');
    expect(el.textContent ?? '').toMatch(/raqam Telegramda yoq/);
  });

  it('reachable → banner UMUMAN chizilmaydi (shovqin qilmasin)', async () => {
    mockReach('reachable');
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    await screen.findByTestId('cp-card-telegram');
    expect(screen.queryByTestId('tg-reachability')).toBeNull();
  });
});

describe('TelegramChatCard — yetkazish holati', () => {
  const CHAT = {
    id: 'chat-1',
    chatId: '77',
    name: 'Akme',
    username: null,
    counterparty: null,
    lastMessageAt: null,
  };

  const msg = (over: Record<string, unknown>) => ({
    id: 'm1',
    direction: 'out',
    text: 'Qarzga qoshildi',
    senderName: null,
    kind: 'text',
    attachmentId: null,
    fileName: null,
    mimeType: null,
    autoKind: 'debt_issued',
    fwdFromName: null,
    delivery: null,
    createdAt: '2026-08-16T06:02:00Z',
    ...over,
  });

  function mockWithMessages(items: Array<Record<string, unknown>>) {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/telegram/business-status')) return BASE_STATUS;
      if (url.includes('/messages')) return { items };
      if (url.startsWith('/telegram/chats')) return { items: [CHAT] };
      return { items: [] };
    });
  }

  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('queued → navbatda chiziladi', async () => {
    mockWithMessages([msg({ delivery: { state: 'queued', at: null, reason: null } })]);
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    const el = await screen.findByTestId('tg-delivery-m1');
    expect(el.textContent ?? '').toMatch(/⏳/);
  });

  it('sent → belgi va vaqt', async () => {
    mockWithMessages([
      msg({ delivery: { state: 'sent', at: '2026-08-16T06:03:00Z', reason: null } }),
    ]);
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    const el = await screen.findByTestId('tg-delivery-m1');
    expect(el.textContent ?? '').toMatch(/✓/);
  });

  it('failed → sabab bilan chiziladi', async () => {
    mockWithMessages([
      msg({ delivery: { state: 'failed', at: null, reason: 'raqam Telegramda yoq' } }),
    ]);
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    const el = await screen.findByTestId('tg-delivery-m1');
    expect(el.textContent ?? '').toMatch(/raqam Telegramda yoq/);
  });

  it('delivery null → HECH NARSA chizilmaydi (yuborildi deb taxmin qilinmaydi)', async () => {
    mockWithMessages([msg({ delivery: null })]);
    renderWithProviders(<TelegramChatCard counterpartyId="cp-1" />);
    await screen.findByTestId('tg-msg-m1');
    expect(screen.queryByTestId('tg-delivery-m1')).toBeNull();
  });
});
