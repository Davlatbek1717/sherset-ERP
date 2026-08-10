import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenejerUndirishPage from './page';

/**
 * MK16 — qarz undirish ish ro'yxati (4M TZ §8.1/2). MK25 Phase-2 QA da yozildi.
 *
 * Bu yerdagi asosiy shartnoma — **o'tkazib yuborilgan qator SABABI o'qiladigan
 * matn bo'lishi**. Sahifa sababni `t(\`reason_${s.reason}\` as never)` bilan
 * chizadi: `as never` typecheck'ni o'chiradi va i18n gate ham dinamik kalitni
 * ko'rmaydi, ya'ni jo'natgich qaytargan har qanday YANGI sabab kodi ekranda
 * xom kalit yo'li bo'lib chiqadi (`pages.menejerCollection.reason_…`).
 *
 * Jo'natgich haqiqatan shunday kodlar qaytaradi:
 *   · `TelegramService.notifyCounterparty` → `no_chat`, `business_not_connected`
 *     (`telegram.service.ts:726,732`) — ikkalasining ham i18n kaliti YO'Q edi;
 *   · o'sha servis xato matnini SABAB sifatida uzatadi
 *     (`reason: msg.slice(0, 200)`) — bunga umuman kalit yozib bo'lmaydi.
 *
 * Shuning uchun test faqat yetishmayotgan kalitlarni emas, **noma'lum kod
 * uchun zaxira matn** borligini ham qulflaydi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

function row(over: Record<string, unknown> = {}) {
  return {
    debtId: 'debt-1',
    debtName: 'QRZ-2026-00001',
    counterpartyId: 'cp-1',
    counterpartyName: 'Romashka MChJ',
    counterpartyPhone: '+998901112233',
    totalMinor: '80000',
    paidMinor: '30000',
    remainingMinor: '50000',
    currency: 'UZS',
    dueAt: '2026-08-06T00:00:00.000Z',
    overdueDays: 4,
    bucket: 'overdue',
    problem: false,
    responsible: { id: 'emp-1', name: 'Anna', role: 'owner' },
    lastContactAt: null,
    lastContactKind: null,
    lastCallOutcome: null,
    remindedToday: false,
    canRemind: true,
    remindBlockedReason: null,
    ...over,
  };
}

function listPayload() {
  return {
    rows: [row()],
    summary: {
      byCurrency: [{ currency: 'UZS', remainingMinor: '50000', count: 1 }],
      overdueCount: 1,
      dueTodayCount: 0,
      upcomingCount: 0,
      noDueDateCount: 0,
      problemCount: 0,
    },
    totalCount: 1,
    truncated: false,
    generatedAt: '2026-08-10T09:00:00.000Z',
  };
}

/** Eslatma bosilib, jo'natgich `reason` bilan o'tkazib yuborgan holat. */
async function remindWithReason(reason: string) {
  vi.mocked(api.get).mockImplementation(async () => listPayload());
  vi.mocked(api.post).mockImplementation(async () => ({
    requested: 1,
    queued: 0,
    journaled: 0,
    skipped: [{ debtId: 'debt-1', name: 'Romashka MChJ', reason }],
  }));

  renderWithProviders(<MenejerUndirishPage />);
  await screen.findByText('Romashka MChJ');

  await userEvent.click(screen.getByTestId('collection-row-debt-1'));
  await userEvent.click(screen.getByTestId('collection-remind'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
}

describe('MK16 — undirish: o‘tkazib yuborish sababi', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  // Telegram jo'natgichi shu kodni qaytaradi (`telegram.service.ts:726`) —
  // mijozning chat'i ulanmagan holat, ya'ni ENG KO'P uchraydigani.
  it('`no_chat` sababi xom i18n kaliti bo‘lib chizilmaydi', async () => {
    await remindWithReason('no_chat');
    expect(screen.queryByText(/pages\.menejerCollection\.reason_/)).toBeNull();
  });

  it('`business_not_connected` sababi xom i18n kaliti bo‘lib chizilmaydi', async () => {
    await remindWithReason('business_not_connected');
    expect(screen.queryByText(/pages\.menejerCollection\.reason_/)).toBeNull();
  });

  // Jo'natgich xato MATNINI sabab sifatida uzatadi (`reason: msg.slice(0,200)`),
  // ya'ni kodlar to'plami yopiq emas — zaxira matn shart.
  it('noma’lum sabab kodi uchun zaxira matn ko‘rsatiladi (xom kalit emas)', async () => {
    await remindWithReason('Bad Request: chat not found');
    expect(screen.queryByText(/pages\.menejerCollection\.reason_/)).toBeNull();
    // Sabab kodining o'zi ko'rinib turishi kerak — menejer nima bo'lganini
    // ko'ra olsin (kod yashirilsa nosozlikni aniqlab bo'lmaydi).
    expect(screen.getByText(/Bad Request: chat not found/)).toBeInTheDocument();
  });

  it('tanish sabab (`sms_not_configured`) tarjima qilingan matn bilan chiqadi', async () => {
    await remindWithReason('sms_not_configured');
    expect(screen.queryByText(/pages\.menejerCollection\.reason_/)).toBeNull();
    // Kanal tanlagichida ham «SMS» bor — shuning uchun aynan natija qatori
    // tekshiriladi, umumiy /SMS/ emas.
    expect(screen.getByText(/Romashka MChJ — SMS sozlanmagan/)).toBeInTheDocument();
  });
});
