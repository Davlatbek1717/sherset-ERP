import { renderWithProviders, screen } from '@/test-utils';
import { describe, expect, it } from 'vitest';
import { TruncatedNotice, UnconvertedNotice } from './report-notices';

/**
 * Faza Q16 — hisobot ko'rinuvchanlik bannerlari.
 *
 * Ikki bayroq API'da ANIQ bor edi, lekin FE ularni umuman o'qimasdi:
 *  - `truncated` (Faza 27a DEFER-1 / Faza Q5 DEFER-3): cap'ga urilgan hisobot
 *    kesilgan ro'yxatni to'liq ro'yxat qilib ko'rsatardi.
 *  - `unconvertedByCurrency` (Faza 17 DEFER-2/3): kursi topilmagan summa
 *    jamiga qo'shilmaydi (to'g'ri), lekin ekranda IZ QOLDIRMASDAN yo'qolardi —
 *    foydalanuvchi kam sonni to'g'ri deb o'qirdi.
 *
 * Shu sababli ikkala banner ham «bor bo'lsa ko'rinadi / yo'q bo'lsa umuman
 * render bo'lmaydi» shartnomasi bilan qulflanadi: doim ko'rinadigan banner
 * qo'rquv-shovqiniga aylanadi, hech qachon ko'rinmagani esa bug.
 */

describe('TruncatedNotice', () => {
  it('truncated=true bo‘lganda banner render bo‘ladi', () => {
    renderWithProviders(<TruncatedNotice truncated testId="sb-truncated-warn" />);
    expect(screen.getByTestId('sb-truncated-warn')).toBeInTheDocument();
    // Kalit yo'li emas, tarjima qiymati chiqishi kerak (next-intl kalitni
    // topa olmasa aynan `report_notices.truncated` matnini chizadi).
    expect(screen.getByTestId('sb-truncated-warn').textContent ?? '').not.toContain(
      'report_notices',
    );
  });

  it('truncated=false bo‘lganda HECH NARSA render bo‘lmaydi', () => {
    const { container } = renderWithProviders(
      <TruncatedNotice truncated={false} testId="sb-truncated-warn" />,
    );
    expect(screen.queryByTestId('sb-truncated-warn')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('truncated undefined (eski javob) — banner yo‘q', () => {
    renderWithProviders(<TruncatedNotice truncated={undefined} testId="sb-truncated-warn" />);
    expect(screen.queryByTestId('sb-truncated-warn')).toBeNull();
  });
});

describe('UnconvertedNotice', () => {
  it('har konvertatsiya qilinmagan valyuta uchun qator chizadi', () => {
    renderWithProviders(
      <UnconvertedNotice
        rows={[
          { currency: 'EUR', amountMinor: '50000' },
          { currency: 'RUB', amountMinor: '12345' },
        ]}
        testId="pnl-unconverted-warn"
      />,
    );

    const box = screen.getByTestId('pnl-unconverted-warn');
    expect(box).toBeInTheDocument();
    const rows = screen.getAllByTestId('pnl-unconverted-warn-row');
    expect(rows).toHaveLength(2);
    // Valyuta KODI ko'rinishi shart — banner mazmuni aynan shu.
    expect(rows[0]?.textContent).toContain('EUR');
    expect(rows[1]?.textContent).toContain('RUB');
    // Summa minor birlikdan major'ga aylantiriladi: 50000 tiyin = 500,00
    expect(rows[0]?.textContent).toContain('500,00');
    expect(rows[1]?.textContent).toContain('123,45');
  });

  it('ro‘yxat bo‘sh bo‘lsa banner umuman render bo‘lmaydi', () => {
    const { container } = renderWithProviders(
      <UnconvertedNotice rows={[]} testId="pnl-unconverted-warn" />,
    );
    expect(screen.queryByTestId('pnl-unconverted-warn')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('rows undefined (maydonsiz eski javob) — banner yo‘q', () => {
    renderWithProviders(<UnconvertedNotice rows={undefined} testId="pnl-unconverted-warn" />);
    expect(screen.queryByTestId('pnl-unconverted-warn')).toBeNull();
  });
});
