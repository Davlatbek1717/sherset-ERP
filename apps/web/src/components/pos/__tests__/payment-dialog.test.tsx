import { PaymentDialog } from '@/components/pos/payment-dialog';
import { renderWithProviders, screen, userEvent, within } from '@/test-utils';
import { describe, expect, it, vi } from 'vitest';

/**
 * F3 (POS redizayn, spec §5.1) — to'lov oynasining TEZ-SUMMA tugmalari.
 *
 * Shartnoma: «Aniq summa» jami'ni qo'yadi; «100 000 / 200 000 / 500 000»
 * naqd maydoniga qiymatni **O'RNATADI** — QO'SHMAYDI. Eski xulq (+1 000 …
 * +50 000 qo'shib borish) ATAYLAB bekor qilindi: kassir «500 ming berdi»
 * deb bosganda avvalgi kiritma ustiga qo'shilib summa adashardi; banknot
 * nominallari (100/200/500 ming) esa qo'shishni talab qilmaydi.
 */

function mount(over: { sumMinor?: bigint; onConfirm?: ReturnType<typeof vi.fn> } = {}) {
  const onConfirm = over.onConfirm ?? vi.fn();
  renderWithProviders(
    <PaymentDialog
      open
      onOpenChange={vi.fn()}
      sumMinor={over.sumMinor ?? 90_000_00n}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm };
}

function dialog() {
  return screen.getByRole('dialog');
}

/** NBSP → oddiy bo'shliq (formatMoney NBSP ishlatadi). */
function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/ /g, ' ');
}

/** Naqd maydonining ko'rsatilgan qiymati (birinchi katta karta). */
function cashText() {
  return norm(within(dialog()).getByTestId('payment-cash-field').textContent);
}

describe('PaymentDialog — tez-summa tugmalari (F3)', () => {
  it('«Aniq summa» jami summani naqd maydoniga qo‘yadi', async () => {
    const user = userEvent.setup();
    mount({ sumMinor: 90_000_00n });

    await user.click(within(dialog()).getByRole('button', { name: 'Aniq summa' }));
    expect(cashText()).toContain('90 000,00');
  });

  it('«100 000» qiymatni O‘RNATADI — terilgan summa USTIGA QO‘SHILMAYDI', async () => {
    const user = userEvent.setup();
    mount({ sumMinor: 90_000_00n });

    // Kassir avval 5 000 tergan bo'lsa ham…
    await user.click(within(dialog()).getByRole('button', { name: '5' }));
    await user.click(within(dialog()).getByRole('button', { name: '000' }));
    expect(cashText()).toContain('5 000,00');

    // …«100 000» bosilганда natija AYNAN 100 000 (105 000 EMAS).
    await user.click(within(dialog()).getByRole('button', { name: '100 000' }));
    expect(cashText()).toContain('100 000,00');
    expect(cashText()).not.toContain('105');
  });

  it('ikkinchi tez-summa avvalgisini ALMASHTIRADI (200 000 → 500 000)', async () => {
    const user = userEvent.setup();
    mount({ sumMinor: 90_000_00n });

    await user.click(within(dialog()).getByRole('button', { name: '200 000' }));
    expect(cashText()).toContain('200 000,00');
    await user.click(within(dialog()).getByRole('button', { name: '500 000' }));
    expect(cashText()).toContain('500 000,00');
  });

  it('tez-summa jami’dan katta bo‘lsa QAYTIM chiqadi va tasdiqda uzatiladi', async () => {
    const user = userEvent.setup();
    const { onConfirm } = mount({ sumMinor: 90_000_00n });

    await user.click(within(dialog()).getByRole('button', { name: '100 000' }));
    // Qaytim: 100 000 − 90 000 = 10 000 (formatMoney NBSP bilan chizadi).
    expect(within(dialog()).getByText(/10[\s ]000,00/)).toBeInTheDocument();

    await user.click(within(dialog()).getByRole('button', { name: "To'lovni tasdiqlash" }));
    expect(onConfirm).toHaveBeenCalledWith(100_000_00n, 0n, 10_000_00n);
  });

  it('eski «+…» qo‘shish tugmalari YO‘Q', () => {
    mount();
    // «+1 000,00 сум» uslubidagi qo'shish tugmalaridan birortasi qolmagan.
    const plusButtons = within(dialog())
      .getAllByRole('button')
      .filter((b) => (b.textContent ?? '').trimStart().startsWith('+'));
    expect(plusButtons).toHaveLength(0);
  });
});
