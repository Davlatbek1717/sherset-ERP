import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * DetailHeader tests — verify the moysklad-parity title line, the
 * caller-supplied state pill, the Provedeno toggle, and the optional
 * pillsSlot / authorSlot.
 */
import { describe, expect, it, vi } from 'vitest';
import { DetailHeader } from './detail-header';

describe('DetailHeader', () => {
  const baseProps = {
    titlePrefix: 'Заказ покупателя',
    name: '04796',
    moment: '2025-06-04T09:39:00.000Z',
    stateLabel: 'Подтверждён',
    stateTone: 'brand' as const,
    stateSlug: 'confirmed',
    applicable: false,
  };

  it('renders title prefix + name + moment', () => {
    renderWithProviders(<DetailHeader {...baseProps} />);
    const title = screen.getByTestId('detail-header-title');
    expect(title.textContent).toContain('Заказ покупателя');
    expect(title.textContent).toContain('04796');
  });

  it('renders state pill with the correct test-id and label', () => {
    renderWithProviders(<DetailHeader {...baseProps} />);
    const pill = screen.getByTestId('detail-header-state-confirmed');
    expect(pill.textContent).toContain('Подтверждён');
  });

  it('renders pillsSlot before the state pill', () => {
    renderWithProviders(
      <DetailHeader
        {...baseProps}
        pillsSlot={<span data-test-id="custom-pill">Не оплачено</span>}
      />,
    );
    expect(screen.getByTestId('custom-pill')).toBeInTheDocument();
  });

  it('renders unchecked Provedeno when applicable=false', () => {
    renderWithProviders(<DetailHeader {...baseProps} />);
    expect(screen.getByTestId('detail-header-applicable-checkbox')).not.toBeChecked();
  });

  it('renders checked Provedeno when applicable=true', () => {
    renderWithProviders(<DetailHeader {...baseProps} applicable />);
    expect(screen.getByTestId('detail-header-applicable-checkbox')).toBeChecked();
  });

  it('fires onToggleApplicable with new value when checkbox clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DetailHeader {...baseProps} onToggleApplicable={onToggle} />);
    await user.click(screen.getByTestId('detail-header-applicable-checkbox'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('disables checkbox when applicableBusy', () => {
    renderWithProviders(
      <DetailHeader {...baseProps} onToggleApplicable={vi.fn()} applicableBusy />,
    );
    expect(screen.getByTestId('detail-header-applicable-checkbox')).toBeDisabled();
  });

  it('renders the author slot', () => {
    renderWithProviders(
      <DetailHeader {...baseProps} authorSlot={<div data-test-id="custom-author">Author X</div>} />,
    );
    expect(screen.getByTestId('custom-author')).toBeInTheDocument();
  });

  it('uses the customTitle override when provided', () => {
    renderWithProviders(<DetailHeader {...baseProps} customTitle={<span>My title</span>} />);
    expect(screen.getByTestId('detail-header-title').textContent).toBe('My title');
  });

  it('renders the Provedeno checkbox by default (FSM documents)', () => {
    renderWithProviders(<DetailHeader {...baseProps} />);
    expect(screen.getByTestId('detail-header-applicable-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('detail-header-applicable-label')).toBeInTheDocument();
  });

  it('hides the Provedeno checkbox when hideApplicable is true (catalog items)', () => {
    renderWithProviders(<DetailHeader {...baseProps} hideApplicable />);
    expect(screen.queryByTestId('detail-header-applicable-checkbox')).toBeNull();
    expect(screen.queryByTestId('detail-header-applicable-label')).toBeNull();
  });

  it('renders different state pill testIds for different stateSlugs', () => {
    const { rerender } = renderWithProviders(
      <DetailHeader {...baseProps} stateSlug="draft" stateLabel="Черновик" stateTone="neutral" />,
    );
    expect(screen.getByTestId('detail-header-state-draft')).toBeInTheDocument();

    rerender(
      <DetailHeader
        {...baseProps}
        stateSlug="cancelled"
        stateLabel="Отменён"
        stateTone="destructive"
      />,
    );
    expect(screen.getByTestId('detail-header-state-cancelled')).toBeInTheDocument();
    expect(screen.getByTestId('detail-header-state-cancelled').textContent).toContain('Отменён');
  });

  it('does NOT call onToggleApplicable when checkbox is omitted', () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <DetailHeader {...baseProps} hideApplicable onToggleApplicable={onToggle} />,
    );
    // Checkbox is hidden, so the user can't click it. Toggle should not fire.
    expect(screen.queryByTestId('detail-header-applicable-checkbox')).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });

  describe('inline state-change dropdown (moysklad «Новый ▾» parity)', () => {
    const stateMenuItems = [
      { slug: 'draft', label: 'Черновик', color: '#9ca3af' },
      { slug: 'confirmed', label: 'Подтверждён', color: '#2563eb' },
      { slug: 'cancelled', label: 'Отменён', color: '#e92919' },
    ];

    it('renders a read-only Badge when stateMenuItems is omitted', () => {
      renderWithProviders(<DetailHeader {...baseProps} />);
      expect(screen.getByTestId('detail-header-state-confirmed')).toBeInTheDocument();
      expect(screen.queryByTestId('detail-header-state-dropdown-confirmed')).toBeNull();
    });

    it('renders a clickable dropdown trigger when stateMenuItems + onStateChange provided', () => {
      renderWithProviders(
        <DetailHeader {...baseProps} stateMenuItems={stateMenuItems} onStateChange={vi.fn()} />,
      );
      expect(screen.getByTestId('detail-header-state-dropdown-confirmed')).toBeInTheDocument();
      // Static badge is replaced by the dropdown.
      expect(screen.queryByTestId('detail-header-state-confirmed')).toBeNull();
    });

    it('calls onStateChange with the chosen slug', async () => {
      const onStateChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DetailHeader
          {...baseProps}
          stateMenuItems={stateMenuItems}
          onStateChange={onStateChange}
        />,
      );
      await user.click(screen.getByTestId('detail-header-state-dropdown-confirmed'));
      await user.click(screen.getByTestId('detail-header-state-option-cancelled'));
      expect(onStateChange).toHaveBeenCalledWith('cancelled');
    });

    it('disables the current state option (cannot transition to self)', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DetailHeader {...baseProps} stateMenuItems={stateMenuItems} onStateChange={vi.fn()} />,
      );
      await user.click(screen.getByTestId('detail-header-state-dropdown-confirmed'));
      expect(screen.getByTestId('detail-header-state-option-confirmed')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });
  });
});
