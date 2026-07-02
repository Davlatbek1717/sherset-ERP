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
    // Per 2026-05-29 audit (moysklad metadata.json source-of-truth) the
    // menu has exactly 4 items in this order, no separators, no info card.
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
  it('renders no support link / info card (audit 2026-05-29: not in moysklad)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrintDropdown />);
    await user.click(screen.getByRole('button', { name: /Chop etish/i }));
    // The earlier "Запросить форму" info card was audit drift — moysklad's
    // captured metadata.json shows no such item. Assert it is gone.
    expect(screen.queryByText("Forma so'rash")).toBeNull();
    expect(screen.queryByText("Qanday so'rash")).toBeNull();
  });
});
