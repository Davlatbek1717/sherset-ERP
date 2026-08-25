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
    // Q4 — default: qo'lda ochilgan reyestr qatori (manba bog'lami yo'q).
    source: 'registry',
    sourceDocId: null,
    sourceDocNumber: null,
    ...over,
  };
}

function listPayload(rows: Array<Record<string, unknown>> = [row()]) {
  const retailSaleCount = rows.filter((r) => r.source === 'retailsale').length;
  return {
    rows,
    summary: {
      byCurrency: [{ currency: 'UZS', remainingMinor: '50000', count: rows.length }],
      overdueCount: rows.length,
      dueTodayCount: 0,
      upcomingCount: 0,
      noDueDateCount: 0,
      problemCount: 0,
      // Q4 — manba sanoqlari.
      retailSaleCount,
      registryCount: rows.length - retailSaleCount,
    },
    totalCount: rows.length,
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

/**
 * Q4 (2026-08-25) — MANBA: «bu qarz qayerdan keldi».
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q4.
 *
 * Egasining birinchi shikoyati («kassadan qo'shilgan qarzdorliklar undirish
 * bo'limida ko'rinmayapti») Q2 da yopilgan edi; Q4 esa menejerga «ko'ringan
 * qator QAYERDAN keldi» degan javobni beradi va uni FILTRLASH imkonini
 * qo'shadi.
 */
describe('Q4 — undirish ro`yxatida MANBA belgisi va filtri', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('kassa cheki qatorida MANBA belgisi va CHEK RAQAMI havolasi chiqadi', async () => {
    vi.mocked(api.get).mockImplementation(async () =>
      listPayload([
        row({ source: 'retailsale', sourceDocId: 'sale-1', sourceDocNumber: 'CHK-2026-00042' }),
      ]),
    );
    renderWithProviders(<MenejerUndirishPage />);
    await screen.findByText('Romashka MChJ');

    expect(screen.getByTestId('collection-source-retailsale')).toBeInTheDocument();
    const link = screen.getByTestId('collection-sale-link');
    expect(link).toHaveTextContent('CHK-2026-00042');
    expect(link).toHaveAttribute('href', '/retail/sales/sale-1');
  });

  it('qo`lda ochilgan qatorda «Reyestr» belgisi, chek havolasi YO`Q', async () => {
    vi.mocked(api.get).mockImplementation(async () => listPayload());
    renderWithProviders(<MenejerUndirishPage />);
    await screen.findByText('Romashka MChJ');

    expect(screen.getByTestId('collection-source-registry')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-sale-link')).toBeNull();
  });

  it('chek RAQAMI kelmasa (hujjat topilmadi) — belgi qoladi, xom id chizilmaydi', async () => {
    vi.mocked(api.get).mockImplementation(async () =>
      listPayload([row({ source: 'retailsale', sourceDocId: 'sale-1', sourceDocNumber: null })]),
    );
    renderWithProviders(<MenejerUndirishPage />);
    await screen.findByText('Romashka MChJ');

    expect(screen.getByTestId('collection-source-retailsale')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-sale-link')).toBeNull();
    expect(screen.queryByText(/sale-1/)).toBeNull();
  });

  it('«Kassadan: N» sanog`i chiqadi (nol bo`lsa umuman chizilmaydi)', async () => {
    vi.mocked(api.get).mockImplementation(async () =>
      listPayload([row({ source: 'retailsale', sourceDocId: 's1', sourceDocNumber: 'CHK-1' })]),
    );
    const { unmount } = renderWithProviders(<MenejerUndirishPage />);
    await screen.findByText('Romashka MChJ');
    expect(screen.getByTestId('collection-retailsale-count')).toHaveTextContent('1');
    unmount();

    vi.mocked(api.get).mockImplementation(async () => listPayload());
    renderWithProviders(<MenejerUndirishPage />);
    await screen.findByText('Romashka MChJ');
    expect(screen.queryByTestId('collection-retailsale-count')).toBeNull();
  });

  it('🔴 filtr SERVERGA uzatiladi; «Hammasi» da `source` parametri YO`Q', async () => {
    vi.mocked(api.get).mockImplementation(async () => listPayload());
    renderWithProviders(<MenejerUndirishPage />);
    await screen.findByText('Romashka MChJ');

    // Boshlang'ich holat — kesim yo'q, ya'ni filtr hech narsani yashirmaydi.
    expect(String(vi.mocked(api.get).mock.calls[0]?.[0])).not.toContain('source=');

    await userEvent.selectOptions(screen.getByTestId('collection-source'), 'retailsale');
    await waitFor(() => {
      const urls = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('source=retailsale'))).toBe(true);
    });

    await userEvent.selectOptions(screen.getByTestId('collection-source'), 'registry');
    await waitFor(() => {
      const urls = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('source=registry'))).toBe(true);
    });
  });

  it('🔴 filtr yoqilganda BO`SH holat kesimni AYTADI (jimgina yashirmaydi)', async () => {
    vi.mocked(api.get).mockImplementation(async () => listPayload([]));
    renderWithProviders(<MenejerUndirishPage />);
    // Filtrsiz bo'sh holat — umumiy matn.
    await screen.findByText(/muddati kelgan qarz topilmadi/i);

    await userEvent.selectOptions(screen.getByTestId('collection-source'), 'retailsale');
    await waitFor(() =>
      expect(screen.getByText(/KASSA CHEKIDAN kelgan qarz topilmadi/i)).toBeInTheDocument(),
    );
  });

  it('manba matnlari xom i18n kaliti bo`lib chizilmaydi', async () => {
    vi.mocked(api.get).mockImplementation(async () =>
      listPayload([
        row({ source: 'retailsale', sourceDocId: 's1', sourceDocNumber: 'CHK-1' }),
        row({ debtId: 'debt-2', counterparty: 'X' }),
      ]),
    );
    renderWithProviders(<MenejerUndirishPage />);
    await screen.findByTestId('collection-source-retailsale');
    expect(screen.queryByText(/pages\.menejerCollection\.source/)).toBeNull();
  });
});
