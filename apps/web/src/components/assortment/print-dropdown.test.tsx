import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * AssortmentPrintDropdown tests — verify the moysklad-parity print menu
 * (Ценник / Термоэтикетка disabled WITHOUT a selection, enabled WITH one —
 * the user-directed QR price-tag flow) plus the persistent «Запросить форму»
 * promo footer. Shared by Товары / Услуги / Комплекты.
 */
import { describe, expect, it, vi } from 'vitest';
import { AssortmentPrintDropdown } from './print-dropdown';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(async (path: string) => {
      if (path.startsWith('/price-types')) return { items: [] };
      return {
        id: 'p1',
        name: 'Test tovar',
        code: '00042',
        article: null,
        barcodes: ['4780000000001'],
        salePrices: [{ priceTypeId: 'default', value: '1250000000' }],
      };
    }),
  },
}));

describe('AssortmentPrintDropdown', () => {
  it('renders the trigger labelled "Chop etish" (uz)', () => {
    renderWithProviders(<AssortmentPrintDropdown />);
    expect(screen.getByRole('button', { name: /Chop etish/i })).toBeInTheDocument();
  });

  it('without a selection the two label items stay disabled (moysklad parity)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssortmentPrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('assortment-print-price-tag')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('assortment-print-thermal-label')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('assortment-print-configure')).not.toHaveAttribute('data-disabled');
    // «Печать» (labels print page shortcut) is ALWAYS enabled.
    expect(screen.getByTestId('assortment-print-labels')).not.toHaveAttribute('data-disabled');
  });

  it('renders the «Запросить форму» promo footer with a CTA', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssortmentPrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('assortment-print-request-form')).toBeInTheDocument();
    expect(screen.getByTestId('assortment-print-request-form-cta')).toBeInTheDocument();
  });

  it('with a selection the label items are enabled and open the tag overlay', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssortmentPrintDropdown selectedIds={new Set(['p1'])} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    const priceTag = screen.getByTestId('assortment-print-price-tag');
    expect(priceTag).not.toHaveAttribute('data-disabled');
    expect(screen.getByTestId('assortment-print-thermal-label')).not.toHaveAttribute(
      'data-disabled',
    );
    await user.click(priceTag);
    expect(await screen.findByTestId('qr-price-tag-overlay')).toBeInTheDocument();
    // The rendered tag carries the four required elements (user brief v2,
    // barcode revision 2026-07-05): big bold name, big bold code, lighter
    // large price, and a REAL Code 128 strip (QR removed — barcode only).
    const name = await screen.findByTestId('qr-tag-name');
    expect(name).toHaveTextContent('Test tovar');
    expect(name).toHaveStyle({ fontWeight: '800' });
    const price = screen.getByTestId('qr-tag-price');
    expect(price).toHaveStyle({ fontWeight: '600' });
    // 1250000000 minor units → «12 500 000» (ru grouping, no kopeks shown).
    expect(price.textContent ?? '').toMatch(/12\s500\s000/);
    const code = screen.getByTestId('qr-tag-code');
    expect(code).toHaveTextContent('00042');
    expect(code).toHaveStyle({ fontWeight: '800' });
    // No QR anywhere; the Code 128 strip has a real bar series (start +
    // data + checksum + stop ⇒ well over 10 bars for any code).
    expect(document.querySelector('[data-test-id="qr-tag-svg"]')).toBeNull();
    const bars = document.querySelectorAll('[data-test-id="tag-barcode-svg"] rect');
    expect(bars.length).toBeGreaterThan(10);
  });
});
