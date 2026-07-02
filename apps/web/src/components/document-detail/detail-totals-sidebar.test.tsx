import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * DetailTotalsSidebar tests — verify the totals rows render with
 * formatted money, the VAT toggles call back, and read-only mode
 * disables the checkboxes.
 */
import { describe, expect, it, vi } from 'vitest';
import { DetailTotalsSidebar } from './detail-totals-sidebar';

describe('DetailTotalsSidebar', () => {
  const baseProps = {
    subtotalMinor: '6400000',
    vatMinor: '0',
    vatEnabled: false,
    vatIncluded: false,
    totalMinor: '6400000',
    totalQty: 2,
  };

  it('renders subtotal, total, qty rows with correct test-ids', () => {
    renderWithProviders(<DetailTotalsSidebar {...baseProps} />);
    expect(screen.getByTestId('totals-subtotal')).toBeInTheDocument();
    expect(screen.getByTestId('totals-total')).toBeInTheDocument();
    expect(screen.getByTestId('totals-qty')).toBeInTheDocument();
    expect(screen.getByTestId('totals-vat-amount')).toBeInTheDocument();
  });

  it('renders qty as the integer count', () => {
    renderWithProviders(<DetailTotalsSidebar {...baseProps} totalQty={5} />);
    expect(screen.getByTestId('totals-qty').textContent).toContain('5');
  });

  it('renders the document currency, not a hardcoded «сум» (non-vacuous)', () => {
    // UZS (default) keeps the «сум» suffix — existing parity.
    const { rerender } = renderWithProviders(<DetailTotalsSidebar {...baseProps} />);
    expect(screen.getByTestId('totals-subtotal').textContent).toContain('сум');
    expect(screen.getByTestId('totals-total').textContent).toContain('сум');
    // A USD document must NOT render «сум» (the bug was «сум» for every currency).
    rerender(<DetailTotalsSidebar {...baseProps} currency="USD" />);
    expect(screen.getByTestId('totals-subtotal').textContent).not.toContain('сум');
    expect(screen.getByTestId('totals-total').textContent).not.toContain('сум');
  });

  it('VAT-enabled checkbox reflects vatEnabled prop', () => {
    const { rerender } = renderWithProviders(
      <DetailTotalsSidebar {...baseProps} vatEnabled={false} />,
    );
    expect(screen.getByTestId('totals-vat-enabled-checkbox')).not.toBeChecked();
    rerender(<DetailTotalsSidebar {...baseProps} vatEnabled={true} />);
    expect(screen.getByTestId('totals-vat-enabled-checkbox')).toBeChecked();
  });

  it('VAT-included row is HIDDEN when vatEnabled=false (moysklad parity)', () => {
    renderWithProviders(
      <DetailTotalsSidebar
        {...baseProps}
        vatEnabled={false}
        onToggleVatEnabled={vi.fn()}
        onToggleVatIncluded={vi.fn()}
      />,
    );
    // moysklad shows «Цена включает НДС» only while НДС is on.
    expect(screen.queryByTestId('totals-vat-included-checkbox')).toBeNull();
  });

  it('VAT-included checkbox is enabled when vatEnabled=true', () => {
    renderWithProviders(
      <DetailTotalsSidebar
        {...baseProps}
        vatEnabled={true}
        onToggleVatEnabled={vi.fn()}
        onToggleVatIncluded={vi.fn()}
      />,
    );
    expect(screen.getByTestId('totals-vat-included-checkbox')).not.toBeDisabled();
  });

  it('readOnly disables both checkboxes', () => {
    renderWithProviders(
      <DetailTotalsSidebar
        {...baseProps}
        vatEnabled={true}
        readOnly
        onToggleVatEnabled={vi.fn()}
        onToggleVatIncluded={vi.fn()}
      />,
    );
    expect(screen.getByTestId('totals-vat-enabled-checkbox')).toBeDisabled();
    expect(screen.getByTestId('totals-vat-included-checkbox')).toBeDisabled();
  });

  it('fires onToggleVatEnabled with the new boolean', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DetailTotalsSidebar {...baseProps} vatEnabled={false} onToggleVatEnabled={onToggle} />,
    );
    await user.click(screen.getByTestId('totals-vat-enabled-checkbox'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('fires onToggleVatIncluded with the new boolean', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DetailTotalsSidebar
        {...baseProps}
        vatEnabled={true}
        vatIncluded={false}
        onToggleVatIncluded={onToggle}
      />,
    );
    await user.click(screen.getByTestId('totals-vat-included-checkbox'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
