import { PieceEntryField } from '@/components/stock-piece/piece-entry-field';
import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { describe, expect, it, vi } from 'vitest';

/**
 * K5 — bo'lak tarkibini kiritish maydoni.
 *
 * Qulflanadigan to'rt shartnoma:
 *  🔴 maydon HECH NARSA yozmaydi — yagona chiqishi `onChange`;
 *  🔴 Σ FAQAT matn to'g'ri bo'lganda uzatiladi (yarim yozilgan qatordan
 *     chiqqan son sanoq maydoniga tushib qolmasin);
 *  🔴 Σ miqdorga teng bo'lmasa ogohlantirish KO'RINADI (server ham 400 beradi —
 *     ekran uni oldindan aytadi);
 *  🔴 priyomkada (`wholeOnly`) bo'lak kiritish ogohlantiriladi.
 */

const noop = () => undefined;

describe('K5 — kiritish maydoni', () => {
  it('bo`sh holatda ko`rsatma ko`rinadi, yig`indi yo`q', () => {
    renderWithProviders(<PieceEntryField value="" onChange={noop} quantity="0" />);
    expect(screen.getByText(/250x3/)).toBeInTheDocument();
    expect(screen.queryByText(/Jami|Итого/)).not.toBeInTheDocument();
  });

  it('to`g`ri matnda yig`indi va bo`laklar soni chiqadi', () => {
    renderWithProviders(
      <PieceEntryField value="250x3+BLK-000041:200+?:150" onChange={noop} quantity="1100" />,
    );
    expect(screen.getByText(/Jami: 1100 · bo'laklar: 5/)).toBeInTheDocument();
  });

  it('🔴 Σ miqdorga teng bo`lmasa OGOHLANTIRISH ko`rinadi', () => {
    renderWithProviders(<PieceEntryField value="250x4" onChange={noop} quantity="900" />);
    // Server ham AYNI shartni tekshiradi (400) — ekran uni oldindan aytadi.
    expect(screen.getByText(/yig'indisi \(1000\) qator miqdoriga \(900\)/)).toBeInTheDocument();
  });

  it('yaroqsiz guruh raqami bilan ko`rsatiladi', () => {
    renderWithProviders(<PieceEntryField value="250+abc" onChange={noop} quantity="250" />);
    expect(screen.getByText(/2-guruh/)).toBeInTheDocument();
  });

  it('🔴 priyomkada (`wholeOnly`) bo`lak kiritilsa ogohlantiriladi', () => {
    renderWithProviders(
      <PieceEntryField value="250x2+?:180" onChange={noop} quantity="680" wholeOnly />,
    );
    expect(screen.getByText(/faqat BUTUN rulon/)).toBeInTheDocument();
  });

  it('🔴 yozilganda `onChange` matn VA yig`indi bilan chaqiriladi', async () => {
    // Maydon KONTROLLASHTIRILGAN (`value` propdan keladi) — chaqiruvchi uni
    // yangilamaguncha ekranda matn o'zgarmaydi. Shu sabab bitta harf yoziladi.
    const onChange = vi.fn();
    renderWithProviders(<PieceEntryField value="25" onChange={onChange} quantity="0" />);
    await userEvent.type(screen.getByRole('textbox'), '0');
    expect(onChange).toHaveBeenLastCalledWith('250', '250');
  });

  it('🔴 yarim yozilgan (yaroqsiz) matnda yig`indi UZATILMAYDI', async () => {
    const onChange = vi.fn();
    renderWithProviders(<PieceEntryField value="250+" onChange={onChange} quantity="0" />);
    await userEvent.type(screen.getByRole('textbox'), 'a');
    expect(onChange).toHaveBeenLastCalledWith('250+a', null);
  });

  it('«Reyestrdan olish» joriy holatni maydonga qo`yadi', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <PieceEntryField
        value=""
        onChange={onChange}
        quantity="0"
        registry={[
          { length: '250', whole: true, label: null },
          { length: '250', whole: true, label: null },
          { length: '200', whole: false, label: 'BLK-000041' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('250x2+BLK-000041:200', '700');
  });

  it('reyestr BO`SH bo`lsa tugma umuman chizilmaydi', () => {
    renderWithProviders(<PieceEntryField value="" onChange={noop} quantity="0" registry={[]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('o`qish rejimida maydon ham, tugma ham bloklangan', () => {
    renderWithProviders(
      <PieceEntryField
        value="250"
        onChange={noop}
        quantity="250"
        disabled
        registry={[{ length: '250', whole: true, label: null }]}
      />,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
