import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * PrintDropdown tests — verify the moysklad menu items render and the
 * onExportList callback fires when "Список заказов" is clicked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrintDropdown } from './print-dropdown';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('PrintDropdown', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('renders the trigger labelled "Chop etish" (uz)', () => {
    renderWithProviders(<PrintDropdown />);
    expect(screen.getByRole('button', { name: /Chop etish/i })).toBeInTheDocument();
  });

  it('opens the menu and renders the 4 moysklad items (list / order / set / configure)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrintDropdown onExportList={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    // The 4 built-in items render in moysklad order (account custom templates,
    // when any, slot between «Комплект…» and «Настроить…»; a «Запросить форму»
    // footer sits below — asserted separately).
    expect(screen.getByTestId('print-list-export')).toBeInTheDocument();
    expect(screen.getByTestId('print-order-form')).toBeInTheDocument();
    expect(screen.getByTestId('print-set')).toBeInTheDocument();
    expect(screen.getByTestId('print-configure-drawer')).toBeInTheDocument();
  });

  it('disables list export when onExportList is not provided', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    expect(screen.getByTestId('print-list-export')).toHaveAttribute('data-disabled');
  });

  it('calls onExportList when list export item is clicked', async () => {
    const user = userEvent.setup();
    const onExportList = vi.fn();
    renderWithProviders(<PrintDropdown onExportList={onExportList} />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    await user.click(screen.getByTestId('print-list-export'));
    expect(onExportList).toHaveBeenCalledTimes(1);
  });

  it('renders the «Запросить форму» support footer (live #customerorder parity)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    // Re-added 2026-07-06: a live moysklad screenshot confirmed the «Запросить
    // форму» promo footer is real (the 2026-05-29 removal read the wrong source
    // — states/metadata.json is entity-state data, not the print menu).
    expect(screen.getByTestId('print-request-form')).toBeInTheDocument();
    expect(screen.getByText("Forma so'rash")).toBeInTheDocument();
    expect(screen.getByTestId('print-request-form-btn')).toBeInTheDocument();
  });
});
