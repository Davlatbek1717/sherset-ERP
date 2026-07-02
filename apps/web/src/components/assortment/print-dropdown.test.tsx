import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * AssortmentPrintDropdown tests — verify the moysklad-parity print menu
 * (Ценник / Термоэтикетка disabled, Настроить... enabled) plus the persistent
 * «Запросить форму» promo footer. Shared by Товары / Услуги / Комплекты.
 */
import { describe, expect, it, vi } from 'vitest';
import { AssortmentPrintDropdown } from './print-dropdown';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe('AssortmentPrintDropdown', () => {
  it('renders the trigger labelled "Chop etish" (uz)', () => {
    renderWithProviders(<AssortmentPrintDropdown />);
    expect(screen.getByRole('button', { name: /Chop etish/i })).toBeInTheDocument();
  });

  it('shows the 3 moysklad items with the two label templates disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssortmentPrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('assortment-print-price-tag')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('assortment-print-thermal-label')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('assortment-print-configure')).not.toHaveAttribute('data-disabled');
  });

  it('renders the «Запросить форму» promo footer with a CTA', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssortmentPrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('assortment-print-request-form')).toBeInTheDocument();
    expect(screen.getByTestId('assortment-print-request-form-cta')).toBeInTheDocument();
  });
});
