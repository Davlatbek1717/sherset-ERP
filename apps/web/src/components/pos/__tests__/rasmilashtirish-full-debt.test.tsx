import { RasmiyashtirishModal } from '@/components/pos/rasmilashtirish-modal';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TO'LIQ QARZ (0 to'lov) — kassa TZ §7.1.
 *
 * Real hodisa (2026-08-12, egasi): mijozga butun chekni qarzga yozmoqchi
 * bo'lganda «Rasmiylashtirish» tugmasi o'lik qolardi — kassir majburan
 * NAQD 1 so'm kiritib, chekni yolg'on to'lov qatori bilan yopardi. Ya'ni
 * qarz summasi ham, kassa naqdi ham 1 so'mga siljib ketardi.
 *
 * Sabab EKRANDA edi, serverda emas: `computeTenders` da `debtMinor > 0`
 * shoxi `paid + debt === total` ni tekshiradi va 0 to'lovni QABUL QILADI
 * (`retail-tenders.ts:153-165`), server esa qarz uchun faqat mijozni talab
 * qiladi (`retail-sale.service.ts:806`). Oynadagi `totalPaid > 0n` sharti
 * server ruxsat bergan holatni o'zi bloklardi.
 *
 * Bu yerda qulflanadigan xulq:
 *  🔴 mijoz tanlangan bo'lsa 0 to'lov bilan rasmiylashtirish MUMKIN;
 *  · mijozsiz 0 to'lov hamon bloklangan (qarz hech kimga yozilmasin);
 *  🔴 summasi 0 bo'lgan chek endi O'TADI (2026-08-19, egasi: «bepulga ham
 *    sota olishi kerak»). Ilgari bu yerda `hasSomethingToSettle` to'sardi:
 *    narx cheklovi olib tashlangani bilan hamma qatori 0 so'mlik chekni YOPIB
 *    bo'lmasdi. Bo'sh savat xavfi boshqa qatlamda yopilgan — savat bo'sh
 *    bo'lsa POS tugmalari o'chiq va bu oyna ochilmaydi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CUSTOMER = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Javohir Hakimov',
  phone: '+998880818186',
  tags: [],
  companyType: 'individualUZ',
};

const RATE = {
  date: '2026-08-11',
  currency: 'USD',
  rate: '12450.27',
  nominal: 1,
  rateMinor: '1245027000000',
  source: 'CBRU',
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/exchange-rates/rate')) return RATE;
    if (path.startsWith('/counterparties')) return { items: [CUSTOMER] };
    throw new Error(`kutilmagan so'rov: ${path}`);
  });
});

function open(sumMinor: bigint, onConfirm = vi.fn()) {
  renderWithProviders(
    <RasmiyashtirishModal open onOpenChange={vi.fn()} sumMinor={sumMinor} onConfirm={onConfirm} />,
  );
  return onConfirm;
}

/** Ro'yxatdan mijozni tanlaydi (oyna ochilganda so'rov avtomatik ketadi). */
async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText(CUSTOMER.name));
}

describe("Rasmilashtirish oynasi — to'liq qarz (0 to'lov)", () => {
  it('🔴 mijoz tanlangach 0 to‘lov bilan rasmiylashtiriladi (1 so‘m talab qilinmaydi)', async () => {
    const user = userEvent.setup();
    const onConfirm = open(245_410_000n); // 2 454 100,00 so'm

    await pickCustomer(user);

    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Butun summa QARZ qatoriga tushadi — naqd qatori TUG'ILMAYDI.
    // `paid + debt === total` bo'lgani uchun server buni qabul qiladi.
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      cashAmountMinor: 0n,
      cardAmountMinor: 0n,
      terminalAmountMinor: 0n,
      cashUsdAmountMinor: 0n,
      debtAmountMinor: 245_410_000n,
      agentId: CUSTOMER.id,
    });
  });

  it('mijozsiz 0 to‘lov hamon bloklangan (qarz egasiz qolmasin)', async () => {
    open(245_410_000n);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Rasmilashtirish/ })).toBeDisabled(),
    );
  });

  it('🔴 summasi 0 bo‘lgan chek (BEPUL savdo) rasmiylashtiriladi', async () => {
    const onConfirm = open(0n);

    // Mijoz TANLANMAGAN: bepul savdoda qarz tug'ilmaydi, demak mijoz shart emas.
    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.setup().click(submit);

    // Hech qanday to'lov qatori tug'ilmaydi — na naqd, na qarz.
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      cashAmountMinor: 0n,
      cardAmountMinor: 0n,
      terminalAmountMinor: 0n,
      cashUsdAmountMinor: 0n,
      debtAmountMinor: 0n,
    });
  });

  it('bepul chekda mijoz tanlansa ham qarz qatori tug‘ilmaydi', async () => {
    const user = userEvent.setup();
    const onConfirm = open(0n);

    await pickCustomer(user);

    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ debtAmountMinor: 0n });
  });

  it('qisman qarz (naqd + qarz) avvalgidek ishlaydi', async () => {
    const user = userEvent.setup();
    const onConfirm = open(245_410_000n);

    await pickCustomer(user);
    await user.type(await screen.findByPlaceholderText('0'), '1000000');

    const submit = screen.getByRole('button', { name: /Rasmilashtirish/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      cashAmountMinor: 100_000_000n,
      debtAmountMinor: 145_410_000n,
      agentId: CUSTOMER.id,
    });
  });
});
