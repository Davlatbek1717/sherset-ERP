import { RasmiyashtirishModal } from '@/components/pos/rasmilashtirish-modal';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A2 (2026-08-25) — «AVANSDAN» to'lov maydoni
 * (reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md`).
 *
 * EGASINING SHIKOYATI: «mijozlar oldindan pul berib qo'yishadi, keyin tovar
 * olishadi — shu mijozlar bilan ishlay olmayapmiz.» A1 pulni QABUL qilishni
 * ochdi; bu yerda kassir uni SARFLAY oladi.
 *
 * Ekranda qulflanadigan shartnomalar:
 *  · maydon FAQAT mijoz tanlangan VA avansi bor bo'lganda faol;
 *  · mavjud avans tugmaning O'ZIDA ko'rinadi (boshqa ekranga chiqmasdan);
 *  · IKKI to'siq — avansdan ortiq va chek qoldig'idan ortiq — tugmani
 *    o'chiradi va sababini AYTADI (kassir xatoni bosgandan KEYIN emas,
 *    oldin ko'rsin);
 *  · mijoz almashsa maydon TOZALANADI (A ning avansiga yozilgan summa B
 *    ning chekida qolmasin).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const WITH_PREPAY = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Avansli Mijoz',
  phone: '+998901112233',
  tags: [],
  companyType: 'individualUZ',
};

const NO_PREPAY = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Qarzdor Mijoz',
  phone: '+998901112244',
  tags: [],
  companyType: 'individualUZ',
};

const RATE = {
  date: '2026-08-25',
  currency: 'USD',
  rate: '12450.27',
  nominal: 1,
  rateMinor: '1245027000000',
  source: 'CBRU',
};

/** Avansi bor mijozda 1 000 so'm (100 000 tiyin). */
const PREPAY_MINOR = '100000';

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/exchange-rates/rate')) return RATE;
    if (path.startsWith('/counterparties')) return { items: [WITH_PREPAY, NO_PREPAY] };
    if (path.startsWith(`/debts/pos/summary/${WITH_PREPAY.id}`)) {
      return { prepayAvailableMinor: PREPAY_MINOR };
    }
    if (path.startsWith(`/debts/pos/summary/${NO_PREPAY.id}`)) {
      // Qarzdor mijoz — avans YO'Q (server `prepayAvailable` dan 0 beradi).
      return { prepayAvailableMinor: '0' };
    }
    throw new Error(`kutilmagan so'rov: ${path}`);
  });
});

function open(sumMinor: bigint, onConfirm = vi.fn()) {
  renderWithProviders(
    <RasmiyashtirishModal open onOpenChange={vi.fn()} sumMinor={sumMinor} onConfirm={onConfirm} />,
  );
  return onConfirm;
}

const prepayButton = () => screen.getByTestId('pos-tender-prepay');

async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByText(name));
}

/** Raqam kiritish — numpad orqali (kassa qobig'idagi yagona yo'l). */
async function typeDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const d of digits) {
    await user.click(screen.getByRole('button', { name: d }));
  }
}

describe('A2 — «Avansdan» maydoni faqat avansi bor mijozda ochiladi', () => {
  it('mijoz tanlanmagan — maydon O`CHIQ', () => {
    open(60_000n);
    expect(prepayButton()).toBeDisabled();
  });

  it('avansi YO`Q mijozda maydon O`CHIQ qoladi', async () => {
    const user = userEvent.setup();
    open(60_000n);

    await pick(user, NO_PREPAY.name);

    await waitFor(() => expect(prepayButton()).toBeDisabled());
  });

  it('avansi BOR mijozda maydon faol va MAVJUD summani ko`rsatadi', async () => {
    const user = userEvent.setup();
    open(60_000n);

    await pick(user, WITH_PREPAY.name);

    await waitFor(() => expect(prepayButton()).toBeEnabled());
    // Kassir «qancha bor» ni tugmaning O'ZIDA ko'radi.
    expect(await screen.findByTestId('pos-prepay-available')).toHaveTextContent('1 000');
  });
});

describe('A2 — avansdan to`lash', () => {
  it('«Aniq» = min(chek qoldig`i, mavjud avans) va payload`ga tushadi', async () => {
    const user = userEvent.setup();
    const onConfirm = open(60_000n);

    await pick(user, WITH_PREPAY.name);
    await waitFor(() => expect(prepayButton()).toBeEnabled());
    await user.click(prepayButton());
    // Avans 1 000, chek 600 ⇒ «Aniq» 600 ni yozadi (avansning hammasini emas).
    await user.click(screen.getByRole('button', { name: /Aniq/ }));

    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      prepayAmountMinor: 60_000n,
      cashAmountMinor: 0n,
      debtAmountMinor: 0n,
      agentId: WITH_PREPAY.id,
    });
  });

  it('🔴 avansdan ORTIQ → tugma o`chiq va sabab AYTILADI', async () => {
    const user = userEvent.setup();
    open(500_000n); // chek 5 000 so'm, avans esa atigi 1 000

    await pick(user, WITH_PREPAY.name);
    await waitFor(() => expect(prepayButton()).toBeEnabled());
    await user.click(prepayButton());
    // ⚠️ Maydon MAJOR birlikda: «2000» = 2 000 so'm, avans esa 1 000 so'm.
    await typeDigits(user, '2000');

    expect(await screen.findByTestId('pos-prepay-over-available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rasmilashtirish/ })).toBeDisabled();
  });

  it('🔴 chek qoldig`idan ORTIQ → «qaytim yo`q» sababi bilan to`siladi', async () => {
    const user = userEvent.setup();
    open(30_000n); // chek 300 so'm, avans 1 000

    await pick(user, WITH_PREPAY.name);
    await waitFor(() => expect(prepayButton()).toBeEnabled());
    await user.click(prepayButton());
    // 500 so'm: avansdan (1 000) KAM, lekin chekdan (300) KO'P — ya'ni
    // AYNAN «qaytim» holati. Ikki to'siq bir-birini bosib qo'ymasin.
    await typeDigits(user, '500');

    // Avansdan naqd qaytim berish A3 ning RKO yo'lini chetlab o'tish
    // bo'lardi, shuning uchun ekranda ham, serverda ham TAQIQ.
    expect(await screen.findByTestId('pos-prepay-over-room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rasmilashtirish/ })).toBeDisabled();
  });

  it('aralash: avans + naqd — qarz qolmaydi', async () => {
    const user = userEvent.setup();
    const onConfirm = open(160_000n);

    await pick(user, WITH_PREPAY.name);
    await waitFor(() => expect(prepayButton()).toBeEnabled());
    await user.click(prepayButton());
    await typeDigits(user, '1000'); // butun avans (1 000 so'm = 100 000 tiyin)

    await user.click(screen.getByTestId('pos-tender-cash'));
    await user.click(screen.getByRole('button', { name: /Aniq/ }));

    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      prepayAmountMinor: 100_000n,
      cashAmountMinor: 60_000n,
      debtAmountMinor: 0n,
    });
  });

  it('🔴 mijoz ALMASHSA avans maydoni tozalanadi (A ning puli B ning chekida qolmasin)', async () => {
    const user = userEvent.setup();
    const onConfirm = open(60_000n);

    await pick(user, WITH_PREPAY.name);
    await waitFor(() => expect(prepayButton()).toBeEnabled());
    await user.click(prepayButton());
    await typeDigits(user, '600');

    // Mijozni olib tashlash → boshqasini tanlash.
    await user.click(
      screen.getByRole('button', { name: /Bekor|✕|X/ }).closest('button') as Element,
    );
    await pick(user, NO_PREPAY.name);

    // Avansi yo'q mijozda maydon o'chadi VA eski summa YO'QOLADI.
    await waitFor(() => expect(prepayButton()).toBeDisabled());
    await user.click(screen.getByTestId('pos-tender-cash'));
    await user.click(screen.getByRole('button', { name: /Aniq/ }));

    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      prepayAmountMinor: 0n,
      cashAmountMinor: 60_000n,
    });
  });
});
