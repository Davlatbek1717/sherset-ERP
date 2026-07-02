import { renderWithProviders, screen } from '@/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { PriceRateDialog } from './price-rate-dialog.tsx';

/**
 * PriceRateDialog — «Курс валюты документа» (product price ✏). Cheap, stable
 * render guards (no timers/async): the dialog is a pure presentational component,
 * and the end-to-end persistence path is browser-verified, so we only lock the
 * structure here (title, reference-rate text, closed→null, radio callbacks).
 */
describe('PriceRateDialog', () => {
  const base = {
    onClose: vi.fn(),
    currencyCode: 'USD',
    baseCode: 'UZS',
    referenceRate: '12700',
    customRate: null,
    onApply: vi.fn(),
  };

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(<PriceRateDialog open={false} {...base} />);
    expect(container.querySelector('[data-test-id="price-rate-dialog"]')).toBeNull();
  });

  it('shows the moysklad title and the reference rate "1 = <rate> <base>"', () => {
    renderWithProviders(<PriceRateDialog open {...base} />);
    expect(screen.getByText('Курс валюты документа')).toBeInTheDocument();
    expect(screen.getByText(/1 = 12700 UZS/)).toBeInTheDocument();
    expect(screen.getByText('Текущий курс валюты из справочника')).toBeInTheDocument();
  });

  it('reference radio is checked when there is no custom rate', () => {
    renderWithProviders(<PriceRateDialog open {...base} />);
    expect(screen.getByTestId('price-rate-reference')).toBeChecked();
    expect(screen.getByTestId('price-rate-custom-radio')).not.toBeChecked();
  });

  it('picking the custom radio applies the reference rate as the starting draft', () => {
    const onApply = vi.fn();
    renderWithProviders(<PriceRateDialog open {...base} onApply={onApply} />);
    screen.getByTestId('price-rate-custom-radio').click();
    expect(onApply).toHaveBeenCalledWith('12700');
  });

  it('with a custom rate the input is enabled and shows it', () => {
    renderWithProviders(<PriceRateDialog open {...base} customRate="13000" />);
    const input = screen.getByTestId('price-rate-custom-input') as HTMLInputElement;
    expect(input).toHaveValue('13000');
    expect(input).not.toBeDisabled();
    expect(screen.getByTestId('price-rate-custom-radio')).toBeChecked();
  });
});
