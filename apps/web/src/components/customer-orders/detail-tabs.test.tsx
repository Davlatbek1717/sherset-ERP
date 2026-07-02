import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * DetailTabsStrip tests — verify the tab strip renders both tabs
 * with correct active state and fires onChange when clicked.
 */
import { describe, expect, it, vi } from 'vitest';
import { DetailTabsStrip } from './detail-tabs';

describe('DetailTabsStrip', () => {
  it('renders both tabs (Главная + Связанные документы)', () => {
    renderWithProviders(<DetailTabsStrip value="main" onChange={vi.fn()} />);
    expect(screen.getByTestId('detail-tab-main')).toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-related')).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected=true', () => {
    renderWithProviders(<DetailTabsStrip value="main" onChange={vi.fn()} />);
    expect(screen.getByTestId('detail-tab-main')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('detail-tab-related')).toHaveAttribute('aria-selected', 'false');
  });

  it('switches active when value prop changes', () => {
    const { rerender } = renderWithProviders(<DetailTabsStrip value="main" onChange={vi.fn()} />);
    rerender(<DetailTabsStrip value="related" onChange={vi.fn()} />);
    expect(screen.getByTestId('detail-tab-related')).toHaveAttribute('aria-selected', 'true');
  });

  it('fires onChange("related") when the second tab is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DetailTabsStrip value="main" onChange={onChange} />);
    await user.click(screen.getByTestId('detail-tab-related'));
    expect(onChange).toHaveBeenCalledWith('related');
  });

  it('fires onChange("main") when the first tab is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DetailTabsStrip value="related" onChange={onChange} />);
    await user.click(screen.getByTestId('detail-tab-main'));
    expect(onChange).toHaveBeenCalledWith('main');
  });
});
