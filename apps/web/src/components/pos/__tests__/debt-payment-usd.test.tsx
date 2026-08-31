import { DebtPaymentDialog } from '@/components/pos/debt-payment-dialog';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F6 — POS «Qarz to'lovi» oynasi DOLLARDA.
 *
 * Server tomoni bu commitda tayyor (`PosDebtPaymentSchema` + `usdCentsToSomTiyin`);
 * bu yerda qulflanadigan xulq — EKRANNING server bilan shartnomasi:
 *
 *  🔴 kurs QO'LDA kiritilmaydi — `GET /exchange-rates/rate?currency=USD` dan
 *     olinadi (kanonik `rateMinor`) va payload'da MUZLATIB yuboriladi;
 *  🔴 kurs yo'q kunda jim 1:1 ga tushish TAQIQ — USD tanlovi bloklanadi
 *     (server ham 400 beradi, lekin kassir sababni OLDIN bilsin);
 *  🔴 `amountMinor` to'lov VALYUTASIDA ketadi (USD → SENT) — so'm ekvivalentini
 *     server hisoblaydi, ekran uni faqat KO'RSATADI;
 *  · ortiqcha to'lov chegarasi SO'M ekvivalenti bo'yicha (server FIFO'si ham
 *    so'mda ishlaydi) — kassir 400 ni bosgandan KEYIN emas, OLDIN ko'rsin.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CP = { id: 'cp-1', name: 'Alisher', phone: '+998901234567' };
const RATE = {
  date: '2026-08-11',
  currency: 'USD',
  rate: '12450.27',
  nominal: 1,
  rateMinor: '1245027000000',
  source: 'CBRU',
};
const SESSION = '44444444-4444-4444-4444-444444444444';

function routes(outstandingMinor: string, rate: unknown = RATE) {
  return async (path: string) => {
    if (path.startsWith('/exchange-rates/rate')) {
      if (rate instanceof Error) throw rate;
      return rate;
    }
    if (path.startsWith('/counterparties')) return { items: [CP] };
    if (path.startsWith('/debts/pos/summary')) {
      return {
        counterparty: CP,
        // P1 — ekran endi `payableMinor` ni o'qiydi. Bu to'plamda balans
        // reyestrga TENG (adopsiya yo'q) ⇒ dollar xulqi o'zgarmaydi.
        payableMinor: outstandingMinor,
        adoptableMinor: '0',
        outstandingMinor,
        openCount: 1,
        oldestAt: '2026-07-01T00:00:00.000Z',
        debts: [
          {
            id: 'd1',
            name: 'QRZ-1',
            totalMinor: outstandingMinor,
            paidMinor: '0',
            outstandingMinor,
            currency: 'UZS',
            orderAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      };
    }
    throw new Error(`kutilmagan so'rov: ${path}`);
  };
}

function openDialog() {
  renderWithProviders(
    <DebtPaymentDialog open onOpenChange={vi.fn()} sessionId={SESSION} cashDeskId="desk-1" />,
  );
}

/** Mijozni tanlab, summa kiritish qadamiga o'tadi. */
async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId(`debt-pay-cp-${CP.id}`));
  await screen.findByTestId('debt-pay-outstanding');
}

/** Summani NUMPAD orqali kiritadi (oynada matn maydoni yo'q — kassa klaviaturasi). */
async function typeAmount(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const d of digits) {
    await user.click(screen.getByRole('button', { name: d }));
  }
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(routes('200000000'));
  vi.mocked(api.post).mockResolvedValue({
    batchId: 'b1',
    receipt: {
      batchId: 'b1',
      paidMinor: '124502700',
      currency: 'USD',
      originalMinor: '10000',
      exchangeRate: RATE.rateMinor,
      method: 'cash',
      lines: [],
      outstandingAfterMinor: '75497300',
    },
    closedCount: 0,
  });
});

describe('Qarz to`lovi oynasi — dollar (F6)', () => {
  it('kursni SERVERDAN oladi va sanasi bilan ko`rsatadi', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await waitFor(() =>
      expect(vi.mocked(api.get)).toHaveBeenCalledWith('/exchange-rates/rate?currency=USD'),
    );
    const hint = await screen.findByTestId('debt-usd-rate');
    expect(hint).toHaveTextContent('12450.27');
    expect(hint).toHaveTextContent('2026-08-11');
  });

  it('🔴 payload: summa SENTDA + valyuta + MUZLATILGAN kurs', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await user.click(screen.getByTestId('debt-pay-currency-usd'));
    await typeAmount(user, '100');
    await user.click(screen.getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      counterpartyId: CP.id,
      amountMinor: '10000', // $100.00 → SENT
      currency: 'USD',
      exchangeRate: '1245027000000',
      retailShiftId: SESSION,
    });
  });

  it('so`m ekvivalenti JONLI ko`rinadi (server formulasi)', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await user.click(screen.getByTestId('debt-pay-currency-usd'));
    await typeAmount(user, '100');

    // 10 000 sent × 1 245 027 000 000 / 10^8 = 124 502 700 tiyin → 1 245 027 so'm
    await waitFor(() =>
      expect(screen.getByTestId('debt-usd-equivalent').textContent ?? '').toMatch(/1\D?245\D?027/),
    );
  });

  it('🔴 ortiqcha to`lov SO`M ekvivalenti bo`yicha bloklanadi', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(routes('100000')); // qarz 1 000 so'm
    openDialog();
    await pickCustomer(user);

    await user.click(screen.getByTestId('debt-pay-currency-usd'));
    await typeAmount(user, '100'); // ≈1 245 027 so'm

    await waitFor(() => expect(screen.getByTestId('debt-pay-confirm')).toBeDisabled());
    expect(vi.mocked(api.post)).not.toHaveBeenCalled();
  });

  it('🔴 kurs topilmasa USD tanlovi BLOKLANADI va sabab ko`rsatiladi', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(routes('200000000', new Error('No rate found for USD')));
    openDialog();
    await pickCustomer(user);

    await waitFor(() => expect(screen.getByTestId('debt-pay-currency-usd')).toBeDisabled());
    expect(screen.getByTestId('debt-usd-rate-missing')).toBeInTheDocument();
  });

  it('kurssiz kunda SO`M to`lovi ishlayveradi (dollar oynani yiqitmaydi)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(routes('200000000', new Error('No rate found for USD')));
    openDialog();
    await pickCustomer(user);

    await typeAmount(user, '5000');
    await user.click(screen.getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      amountMinor: '500000',
      currency: 'UZS',
    });
  });

  it("SO'M to'lovi kurs yubormaydi (regressiya yo'q)", async () => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await typeAmount(user, '5000');
    await user.click(screen.getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.currency).toBe('UZS');
    expect(body.exchangeRate ?? null).toBeNull();
  });

  it('«Hammasi» dollarda PASTGA yaxlitlaydi (server ortiqchani rad etadi)', async () => {
    const user = userEvent.setup();
    // Qarz 124 502 700 tiyin = AYNAN $100. Pastga yaxlitlash $100 beradi.
    vi.mocked(api.get).mockImplementation(routes('124502750'));
    openDialog();
    await pickCustomer(user);

    await user.click(screen.getByTestId('debt-pay-currency-usd'));
    await user.click(screen.getByTestId('debt-pay-all'));
    await user.click(screen.getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1));
    // 124 502 750 tiyin / kurs = 100.0000401… $ → 10 000 sent (pastga).
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({ amountMinor: '10000' });
  });

  it('valyuta almashtirilganda kiritilgan summa TOZALANADI (sent≠tiyin)', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await typeAmount(user, '5000');
    await user.click(screen.getByTestId('debt-pay-currency-usd'));

    expect(screen.getByTestId('debt-pay-amount').textContent?.trim()).toBe('0');
  });
});

describe('Qarz to`lovi oynasi — USD × to`lov turi', () => {
  it('«Naqd USD» kanali serverga method:cash + currency:USD bo`lib ketadi', async () => {
    // 2026-08-31 redizayn: valyuta alohida qator EMAS — «Naqd USD» sotuvdagi
    // kabi kanal-kartochka. Dollar TERMINAL/KARTA/HISOB orqali kelmaydi:
    // u kanallar tanlansa to'lov avtomatik so'mga o'tadi (quyidagi test).
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await user.click(screen.getByTestId('debt-pay-currency-usd'));
    await typeAmount(user, '100');
    await user.click(screen.getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      method: 'cash',
      currency: 'USD',
    });
  });

  it('USD dan TERMINALga o`tilsa — to`lov SO`M bo`lib ketadi (summa tozalanadi)', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await user.click(screen.getByTestId('debt-pay-currency-usd'));
    await typeAmount(user, '100');
    await user.click(screen.getByTestId('debt-pay-method-terminal'));
    // Valyuta almashdi (sent≠tiyin) — summa tozalanadi, kassir qayta teradi.
    expect(screen.getByTestId('debt-pay-amount').textContent?.trim()).toBe('0');

    await typeAmount(user, '5000');
    await user.click(screen.getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      method: 'terminal',
      currency: 'UZS',
      amountMinor: '500000',
    });
  });
});

describe('Qarz to`lovi oynasi — yangi kanallar (2026-08-31)', () => {
  it.each([
    ['debt-pay-method-card', 'card'],
    ['debt-pay-method-account', 'account'],
  ] as const)('%s kanali serverga method:%s bo`lib ketadi (so`mda)', async (testId, method) => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await user.click(screen.getByTestId(testId));
    await typeAmount(user, '5000');
    await user.click(screen.getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({ method, currency: 'UZS', amountMinor: '500000' });
    // Naqdsiz kanal kurs olib ketmaydi.
    expect(body.exchangeRate ?? null).toBeNull();
  });

  it('so`m-kanallar orasida almashganda kiritilgan summa SAQLANADI', async () => {
    const user = userEvent.setup();
    openDialog();
    await pickCustomer(user);

    await typeAmount(user, '5000');
    await user.click(screen.getByTestId('debt-pay-method-card'));
    expect(screen.getByTestId('debt-pay-amount').textContent ?? '').toMatch(/5\D?000/);
  });
});
