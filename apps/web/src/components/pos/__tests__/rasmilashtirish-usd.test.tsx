import { RasmiyashtirishModal } from '@/components/pos/rasmilashtirish-modal';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F5 (MK31) — dollar naqd tenderi to'lov oynasida.
 *
 * Server tomoni ALLAQACHON tayyor (`retail-tenders.ts` · `retail-sale.schema.ts` ·
 * `RetailSalePayment`); bu yerda qulflanadigan xulq — EKRANNING server bilan
 * shartnomasi:
 *
 *  🔴 kurs QO'LDA kiritilmaydi — `GET /exchange-rates/rate?currency=USD` dan
 *     olinadi va payload'da MUZLATIB yuboriladi;
 *  🔴 kurs yo'q kunda jim 1:1 ga tushish TAQIQ — maydon bloklanadi va sabab
 *     ko'rsatiladi (server ham 400 beradi, lekin kassir sababni oldin bilsin);
 *  · so'm ekvivalenti server formulasi (`convertByRateE8`) bilan chiziladi —
 *    kassir ko'rgan qaytim server hisoblaganidan farq qilmasin;
 *  · qaytim chegarasiga dollarning so'm ekvivalenti KIRADI
 *    (`retail-tenders.ts` `cashLikeMinor`).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const RATE = {
  date: '2026-08-11',
  currency: 'USD',
  rate: '12450.27',
  nominal: 1,
  rateMinor: '1245027000000',
  source: 'CBRU',
};

/** Kurs so'rovi muvaffaqiyatli; kontragent qidiruvi bo'sh. */
function okRoutes(rate: unknown = RATE) {
  return async (path: string) => {
    if (path.startsWith('/exchange-rates/rate')) {
      if (rate instanceof Error) throw rate;
      return rate;
    }
    if (path.startsWith('/counterparties')) return { items: [] };
    throw new Error(`kutilmagan so'rov: ${path}`);
  };
}

function open(sumMinor: bigint, onConfirm = vi.fn()) {
  renderWithProviders(
    <RasmiyashtirishModal open onOpenChange={vi.fn()} sumMinor={sumMinor} onConfirm={onConfirm} />,
  );
  return onConfirm;
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(okRoutes());
});

describe('Rasmilashtirish oynasi — dollar naqd', () => {
  it('kursni serverdan oladi (qo‘lda kiritilmaydi) va ko‘rsatadi', async () => {
    open(1_000_000n);
    await waitFor(() =>
      expect(vi.mocked(api.get)).toHaveBeenCalledWith('/exchange-rates/rate?currency=USD'),
    );
    expect(await screen.findByTestId('pos-usd-rate')).toHaveTextContent('12450.27');
    // Kursning SANASI ham ko'rinadi — carry-forward tufayli u bugungi
    // bo'lmasligi mumkin, kassir buni bilishi kerak.
    expect(screen.getByTestId('pos-usd-rate')).toHaveTextContent('2026-08-11');
  });

  it('dollar summasi payload‘ga sent + MUZLATILGAN kurs bo‘lib ketadi', async () => {
    const user = userEvent.setup();
    // 155 628 so'mlik chek — $12.50 (12 450,27 kurs bo'yicha 155 628,375) yopadi.
    const onConfirm = open(15_562_837n);

    await user.click(await screen.findByTestId('pos-tender-cash-usd'));
    await user.type(screen.getByPlaceholderText('0'), '12.50');
    await user.click(screen.getByRole('button', { name: /Rasmilashtirish/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      cashAmountMinor: 0n,
      cashUsdAmountMinor: 1250n,
      usdRateMinor: '1245027000000',
    });
  });

  it('so‘m ekvivalenti server formulasi bilan jonli ko‘rinadi', async () => {
    const user = userEvent.setup();
    open(15_562_837n);

    await user.click(await screen.findByTestId('pos-tender-cash-usd'));
    await user.type(screen.getByPlaceholderText('0'), '12.50');

    // 1250 sent × 1 245 027 000 000 / 10^8 = 15 562 837 tiyin → 155 628,37 so'm
    await waitFor(() =>
      expect(screen.getByTestId('pos-usd-equivalent').textContent ?? '').toMatch(/155\D?628/),
    );
  });

  it('🔴 kurs topilmasa dollar maydoni BLOKLANADI va sabab ko‘rsatiladi', async () => {
    vi.mocked(api.get).mockImplementation(okRoutes(new Error('No rate found for USD')));
    open(1_000_000n);

    const usdBtn = await screen.findByTestId('pos-tender-cash-usd');
    await waitFor(() => expect(usdBtn).toBeDisabled());
    expect(screen.getByTestId('pos-usd-rate-missing')).toBeInTheDocument();
  });

  it('kurssiz holatda so‘m to‘lovi ISHLAYVERADI (dollar butun oynani yiqitmaydi)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(okRoutes(new Error('No rate found for USD')));
    const onConfirm = open(1_000_000n);

    await user.type(await screen.findByPlaceholderText('0'), '10000');
    await user.click(screen.getByRole('button', { name: /Rasmilashtirish/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      cashAmountMinor: 1_000_000n,
      cashUsdAmountMinor: 0n,
      usdRateMinor: null,
    });
  });

  it('qaytim chegarasiga dollarning so‘m ekvivalenti KIRADI (server bilan mos)', async () => {
    const user = userEvent.setup();
    // 1 000 so'mlik chek, mijoz $1 beradi (≈12 450 so'm) → qaytim 11 450 so'm.
    // Server `cashLikeMinor` ga dollarni qo'shadi, ya'ni bu HOLAT RUXSAT ETILGAN.
    const onConfirm = open(100_000n);

    await user.click(await screen.findByTestId('pos-tender-cash-usd'));
    await user.type(screen.getByPlaceholderText('0'), '1');
    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ortiqcha KARTA to‘lovi hamon bloklangan (qaytim faqat naqddan)', async () => {
    const user = userEvent.setup();
    open(100_000n);

    await user.click(await screen.findByTestId('pos-tender-card'));
    await user.type(screen.getByPlaceholderText('0'), '2000');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Rasmilashtirish/ })).toBeDisabled(),
    );
  });
});
